import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { SessionService } from './session.service';
import { BrowserService } from './browser.service';
import { CaptureService } from './capture.service';
import { StorageService } from './storage.service';
import { StartRecordingDto } from '../dto/start-recording.dto';
import { StopRecordingDto } from '../dto/stop-recording.dto';
import { RecordingSession, SessionStatus } from '../../common/types';
import { RecordingException } from '../../common/exceptions';
import { EventEmitter } from 'events';

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);
  private readonly stopEmitter = new EventEmitter();
  private busy = false;

  constructor(
    private readonly sessionService: SessionService,
    private readonly browserService: BrowserService,
    private readonly captureService: CaptureService,
    private readonly storageService: StorageService,
  ) {}

  isBusy(): boolean {
    return this.busy;
  }

  async startRecording(
    dto: StartRecordingDto,
  ): Promise<{ sessionId: string; status: string }> {
    if (this.busy) {
      throw new RecordingException(
        'This recorder instance is already recording',
        HttpStatus.CONFLICT,
      );
    }

    const { meetingId } = dto;

    // Prevent duplicate recording for the same meeting
    const existing = await this.sessionService.getSessionByMeetingId(meetingId);
    if (
      existing &&
      ![SessionStatus.STOPPED, SessionStatus.FAILED].includes(existing.status)
    ) {
      throw new RecordingException(
        `Recording already active for meeting: ${meetingId}`,
        HttpStatus.CONFLICT,
      );
    }

    const session = await this.sessionService.createSession(meetingId);
    this.busy = true;

    // Run the recording lifecycle in the background — do not await
    this.runRecording(session.sessionId, meetingId).catch((err) => {
      this.logger.error(`Unhandled recording error: ${err?.message}`);
    });

    return { sessionId: session.sessionId, status: SessionStatus.STARTING };
  }

  async stopRecording(
    dto: StopRecordingDto,
  ): Promise<{ sessionId: string; status: string }> {
    const { meetingId } = dto;

    const session = await this.sessionService.getSessionByMeetingId(meetingId);
    if (!session) {
      throw new RecordingException(
        `No recording found for meeting: ${meetingId}`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new RecordingException(
        `Recording is not active (current status: ${session.status})`,
        HttpStatus.BAD_REQUEST,
      );
    }

    this.stopEmitter.emit(`stop:${session.sessionId}`);

    return { sessionId: session.sessionId, status: SessionStatus.STOPPING };
  }

  async getStatus(sessionId: string): Promise<RecordingSession> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      throw new RecordingException(
        `Session not found: ${sessionId}`,
        HttpStatus.NOT_FOUND,
      );
    }
    return session;
  }

  private async runRecording(
    sessionId: string,
    meetingId: string,
  ): Promise<void> {
    try {
      await this.sessionService.updateSession(sessionId, {
        status: SessionStatus.STARTING,
      });

      const outputDir = this.storageService.getOutputDir(sessionId);
      this.storageService.ensureDir(outputDir);

      await this.browserService.createRecordingPage(
        sessionId,
        meetingId,
        outputDir,
      );

      await this.browserService.startAudioCapture(sessionId, outputDir);

      await this.sessionService.updateSession(sessionId, {
        status: SessionStatus.ACTIVE,
      });

      this.logger.log(`Recording active: session=${sessionId}`);

      await this.waitForStop(sessionId);

      await this.sessionService.updateSession(sessionId, {
        status: SessionStatus.STOPPING,
      });

      const audioPath = await this.browserService.stopAudioCapture();
      const videoPath = await this.browserService.closeActivePage();

      let finalOutputPath: string | undefined = videoPath ?? undefined;

      if (videoPath && audioPath) {
        const mergedPath = this.storageService.getOutputPath(sessionId);
        try {
          await this.captureService.mergeAudioVideo(
            videoPath,
            audioPath,
            mergedPath,
          );
          // Merge succeeded — remove the intermediate raw files
          this.storageService.cleanupTempFiles(videoPath, audioPath);
          finalOutputPath = mergedPath;
        } catch (err) {
          // Merge failed — keep the raw video as the output
          this.logger.warn(
            `Audio/video merge failed; keeping video-only output at: ${videoPath}`,
          );
          this.storageService.cleanupTempFiles(audioPath);
        }
      }

      await this.sessionService.updateSession(sessionId, {
        status: SessionStatus.STOPPED,
        stoppedAt: new Date().toISOString(),
        outputPath: finalOutputPath,
      });

      this.logger.log(`Recording completed: session=${sessionId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Recording failed: session=${sessionId} — ${message}`);
      await this.sessionService.updateSession(sessionId, {
        status: SessionStatus.FAILED,
        error: message,
        stoppedAt: new Date().toISOString(),
      });
      // Attempt cleanup even on failure
      await this.browserService.stopAudioCapture().catch(() => {});
      await this.browserService.closeActivePage().catch(() => {});
    } finally {
      this.busy = false;
    }
  }

  private waitForStop(sessionId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.stopEmitter.once(`stop:${sessionId}`, resolve);
    });
  }
}
