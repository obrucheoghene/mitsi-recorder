import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import Redis from 'ioredis';
import { SQS_CLIENT, REDIS_SUBSCRIBER } from './queue.module';
import { BrowserService } from '../recording/services/browser.service';
import { CaptureService } from '../recording/services/capture.service';
import { SessionService } from '../recording/services/session.service';
import { StorageService } from '../recording/services/storage.service';
import { SessionStatus } from '../common/types';

@Injectable()
export class QueueConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueConsumerService.name);
  private running = false;
  private busy = false;
  private readonly queueUrl: string;
  private readonly visibilityTimeout: number;
  private readonly pollWaitSeconds: number;
  private readonly maxDurationMs: number;

  constructor(
    @Inject(SQS_CLIENT) private readonly sqsClient: SQSClient,
    @Inject(REDIS_SUBSCRIBER) private readonly redisSubscriber: Redis,
    private readonly browserService: BrowserService,
    private readonly captureService: CaptureService,
    private readonly sessionService: SessionService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {
    this.queueUrl = this.configService.get<string>('aws.sqsQueueUrl')!;
    this.visibilityTimeout = this.configService.get<number>(
      'sqs.visibilityTimeout',
    )!;
    this.pollWaitSeconds = this.configService.get<number>(
      'sqs.pollWaitSeconds',
    )!;
    this.maxDurationMs = this.configService.get<number>(
      'recording.maxDurationMs',
    )!;
  }

  async onModuleInit() {
    this.running = true;
    this.pollLoop();
  }

  async onModuleDestroy() {
    this.running = false;
    await this.redisSubscriber.quit();
  }

  isBusy(): boolean {
    return this.busy;
  }

  private async pollLoop(): Promise<void> {
    this.logger.log('SQS poll loop started');

    while (this.running) {
      if (this.busy) {
        await this.sleep(5000);
        continue;
      }

      try {
        const result = await this.sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: this.pollWaitSeconds,
            VisibilityTimeout: this.visibilityTimeout,
          }),
        );

        const messages = result.Messages;
        if (!messages || messages.length === 0) {
          continue;
        }

        const message = messages[0];
        const body = JSON.parse(message.Body!);
        const { sessionId, meetingId } = body;

        this.logger.log(
          `Received job: session=${sessionId}, meeting=${meetingId}`,
        );

        this.busy = true;

        try {
          await this.processRecording(sessionId, meetingId);
        } catch (error) {
          const errMsg =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Recording failed for session ${sessionId}: ${errMsg}`,
          );
          await this.sessionService.updateSession(sessionId, {
            status: SessionStatus.FAILED,
            error: errMsg,
            stoppedAt: new Date().toISOString(),
          });
        }

        // Delete message from SQS after processing (success or failure)
        await this.sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: this.queueUrl,
            ReceiptHandle: message.ReceiptHandle!,
          }),
        );

        this.busy = false;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Poll loop error: ${errMsg}`);
        this.busy = false;
        await this.sleep(5000);
      }
    }

    this.logger.log('SQS poll loop stopped');
  }

  private async processRecording(
    sessionId: string,
    meetingId: string,
  ): Promise<void> {
    // 1. Update session → STARTING
    await this.sessionService.updateSession(sessionId, {
      status: SessionStatus.STARTING,
    });

    // 2. Prepare output directory
    const outputDir = this.storageService.getOutputDir(sessionId);
    this.storageService.ensureDir(outputDir);

    // 3. Launch browser and join meeting
    await this.browserService.createRecordingPage(
      sessionId,
      meetingId,
      outputDir,
    );

    // 4. Start audio capture
    const audioPath = await this.captureService.startCapture(
      sessionId,
      outputDir,
    );

    // 5. Update session → ACTIVE
    await this.sessionService.updateSession(sessionId, {
      status: SessionStatus.ACTIVE,
    });

    this.logger.log(`Recording active for session: ${sessionId}`);

    // 6. Wait for stop signal via Redis pub/sub, max duration, or page crash
    const stopReason = await this.waitForStop(sessionId);
    this.logger.log(`Recording stop reason: ${stopReason}`);

    // 7. Update session → STOPPING
    await this.sessionService.updateSession(sessionId, {
      status: SessionStatus.STOPPING,
    });

    // 8. Stop audio capture
    await this.captureService.stopCapture();

    // 9. Close browser page and get video path
    const videoPath = await this.browserService.closeActivePage();

    // 10. Merge audio + video
    const outputPath = this.storageService.getOutputPath(sessionId);

    if (videoPath && audioPath) {
      try {
        await this.captureService.mergeAudioVideo(
          videoPath,
          audioPath,
          outputPath,
        );
      } catch (mergeError) {
        this.logger.warn(
          `Merge failed, video-only output available at: ${videoPath}`,
        );
      }
    }

    // 11. Clean up temp files
    this.storageService.cleanupTempFiles(sessionId);

    // 12. Update session → STOPPED
    await this.sessionService.updateSession(sessionId, {
      status: SessionStatus.STOPPED,
      stoppedAt: new Date().toISOString(),
      outputPath: outputPath || videoPath || undefined,
    });

    this.logger.log(`Recording completed for session: ${sessionId}`);
  }

  private waitForStop(sessionId: string): Promise<string> {
    return new Promise<string>((resolve) => {
      const channel = `recording:stop:${sessionId}`;
      let resolved = false;

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(maxDurationTimer);
        this.redisSubscriber.unsubscribe(channel).catch(() => {});
      };

      // Listen for stop signal via Redis pub/sub
      this.redisSubscriber.subscribe(channel).catch((err) => {
        this.logger.error(`Failed to subscribe to ${channel}: ${err}`);
      });

      this.redisSubscriber.on('message', (ch, message) => {
        if (ch === channel && !resolved) {
          cleanup();
          resolve(`stop_signal: ${message}`);
        }
      });

      // Max duration timeout
      const maxDurationTimer = setTimeout(() => {
        if (!resolved) {
          cleanup();
          resolve('max_duration_reached');
        }
      }, this.maxDurationMs);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
