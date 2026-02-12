import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import Redis from 'ioredis';
import { SessionService } from './session.service';
import { StartRecordingDto } from '../dto/start-recording.dto';
import { StopRecordingDto } from '../dto/stop-recording.dto';
import { RecordingSession, SessionStatus } from '../../common/types';
import { RecordingException } from '../../common/exceptions';
import { SQS_CLIENT } from '../../queue/queue.module';
import { HttpStatus } from '@nestjs/common';

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);
  private readonly queueUrl: string;
  private readonly redisPublisher: Redis;

  constructor(
    @Inject(SQS_CLIENT) private readonly sqsClient: SQSClient,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {
    this.queueUrl = this.configService.get<string>('aws.sqsQueueUrl')!;
    this.redisPublisher = new Redis(
      this.configService.get<string>('redis.url')!,
    );
  }

  async startRecording(
    dto: StartRecordingDto,
  ): Promise<{ sessionId: string; status: string }> {
    const { meetingId } = dto;

    // Check for existing active recording
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

    // Create session
    const session = await this.sessionService.createSession(meetingId);

    // Send message to SQS
    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({
          sessionId: session.sessionId,
          meetingId,
        }),
      }),
    );

    this.logger.log(
      `Recording queued: session=${session.sessionId}, meeting=${meetingId}`,
    );

    return { sessionId: session.sessionId, status: SessionStatus.QUEUED };
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

    // Publish stop signal via Redis pub/sub
    const channel = `recording:stop:${session.sessionId}`;
    await this.redisPublisher.publish(channel, 'stop');

    // Update session status
    await this.sessionService.updateSession(session.sessionId, {
      status: SessionStatus.STOPPING,
    });

    this.logger.log(
      `Stop signal sent: session=${session.sessionId}, meeting=${meetingId}`,
    );

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
}
