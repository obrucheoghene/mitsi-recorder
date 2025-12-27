import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { BrowserService } from './browser.service';
import { SessionService } from './session.service';
import { StreamingService } from './streaming.service';
import { AudioCaptureService } from './audio-capture.service';
import { CleanupService } from './cleanup.service';
// import { MergingServiceClient } from '../clients/merging-service.client';
import { StartRecordingDto } from '../dto/start-recording.dto';
import { RecordingSession, SessionStatus } from '../../common/types';
import { RecordingException } from '../../common/exceptions';
import { getEnvConfig } from '../../config/env';

@Injectable()
export class RecordingService implements OnModuleDestroy {
  private logger = new Logger(RecordingService.name);
  private config = getEnvConfig();
  private sessionTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private browserService: BrowserService,
    private sessionService: SessionService,
    private streamingService: StreamingService,
    private audioCaptureService: AudioCaptureService,
    // private mergingClient: MergingServiceClient,
    private cleanupService: CleanupService,
  ) {}

  async startRecording(dto: StartRecordingDto): Promise<RecordingSession> {
    this.logger.log(`Starting recording for meeting ${dto.meetingId}`);

    const session = this.sessionService.create(
      dto.meetingId,
      dto.userId,
      dto.mode,
      dto.streamUrl,
    );

    try {
      await this.browserService.createContext(session.recordingSessionId);
      const page = await this.browserService.createPage(
        session.recordingSessionId,
        this.config.LOCAL_CLIENT_URL,
      );

      if (dto.mode === 'record' || dto.mode === 'record_stream') {
        this.audioCaptureService.startAudioCapture(
          session.recordingSessionId,
          process.pid,
        );
      }

      await this.browserService.joinMeeting(
        session.recordingSessionId,
        dto.meetingId,
        dto.userId,
      );

      if (dto.mode === 'stream' || dto.mode === 'record_stream') {
        await this.streamingService.startStreaming(
          session.recordingSessionId,
          page,
          dto.streamUrl,
        );
      }

      this.sessionService.update(session.recordingSessionId, {
        status: SessionStatus.ACTIVE,
      });

      this.setSessionTimeout(session.recordingSessionId);

      this.logger.log(`Recording started: ${session.recordingSessionId}`);
      return this.sessionService.get(session.recordingSessionId);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start recording: ${errMsg}`);
      this.sessionService.update(session.recordingSessionId, {
        status: SessionStatus.ERROR,
        error: errMsg,
      });
      this.cleanupService.cleanupSession(session.recordingSessionId);
      throw new RecordingException(errMsg);
    }
  }

  async stopRecording(recordingSessionId: string): Promise<RecordingSession> {
    this.logger.log(`Stopping recording: ${recordingSessionId}`);

    const session = this.sessionService.get(recordingSessionId);

    try {
      if (session.mode === 'stream' || session.mode === 'record_stream') {
        await this.streamingService.stopStreaming(recordingSessionId);
      }

      if (session.mode === 'record' || session.mode === 'record_stream') {
        await this.audioCaptureService.stopAudioCapture(recordingSessionId);
      }

      const { videoPath } =
        await this.browserService.closeContext(recordingSessionId);
      await this.browserService.closePage(recordingSessionId);

      const audioPath =
        this.audioCaptureService.getAudioPath(recordingSessionId);

      this.sessionService.update(recordingSessionId, {
        status: SessionStatus.STOPPED,
        endTime: new Date(),
        videoPath,
        audioPath,
      });

      // await this.mergingClient.merge({
      //   recordingSessionId,
      //   meetingId: session.meetingId,
      //   videoPath,
      //   audioPath,
      // });

      const timer = this.sessionTimers.get(recordingSessionId);
      if (timer) clearTimeout(timer);

      // Cleanup after merge if configured
      if (this.config.CLEANUP_AFTER_MERGE) {
        setTimeout(() => {
          this.cleanupService.cleanupSession(recordingSessionId);
        }, 5000);
      }

      this.logger.log(`Recording stopped: ${recordingSessionId}`);
      return this.sessionService.get(recordingSessionId);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to stop recording: ${errMsg}`);
      this.sessionService.update(recordingSessionId, {
        status: SessionStatus.ERROR,
        error: errMsg,
      });
      throw new RecordingException(errMsg);
    }
  }

  getStatus(recordingSessionId: string): RecordingSession {
    return this.sessionService.get(recordingSessionId);
  }

  private setSessionTimeout(recordingSessionId: string): void {
    const timer = setTimeout(() => {
      this.logger.warn(
        `Max session duration exceeded for ${recordingSessionId}`,
      );
      this.stopRecording(recordingSessionId).catch((error) => {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to auto-stop session: ${errMsg}`);
      });
    }, this.config.MAX_SESSION_DURATION);

    this.sessionTimers.set(recordingSessionId, timer);
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down recording service...');

    // Clear all timers
    this.sessionTimers.forEach((timer) => clearTimeout(timer));
    this.sessionTimers.clear();

    // Stop all active sessions
    const sessionsMap = (
      this.sessionService as unknown as {
        sessions: Map<string, RecordingSession>;
      }
    ).sessions;
    const sessions = Array.from(sessionsMap.values());
    for (const session of sessions) {
      if (session.status === SessionStatus.ACTIVE) {
        try {
          await this.stopRecording(session.recordingSessionId);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to stop session on shutdown: ${errMsg}`);
        }
      }
    }
  }
}
