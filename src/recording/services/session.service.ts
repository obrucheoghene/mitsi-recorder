import { Injectable } from '@nestjs/common';
// import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  RecordingSession,
  SessionStatus,
  RecordingMode,
} from '../../common/types';
import { RecordingException } from '../../common/exceptions';

@Injectable()
export class SessionService {
  private sessions = new Map<string, RecordingSession>();
  private meetingToSession = new Map<string, string>();

  create(
    meetingId: string,
    userId: string,
    mode: RecordingMode,
    streamUrl?: string,
  ): RecordingSession {
    if (this.meetingToSession.has(meetingId)) {
      throw new RecordingException(
        `Meeting ${meetingId} already has an active session`,
      );
    }

    const session: RecordingSession = {
      recordingSessionId: crypto.randomUUID(),
      meetingId,
      userId,
      mode,
      status: SessionStatus.STARTING,
      startTime: new Date(),
      streamUrl,
    };

    this.sessions.set(session.recordingSessionId, session);
    this.meetingToSession.set(meetingId, session.recordingSessionId);

    return session;
  }

  get(recordingSessionId: string): RecordingSession {
    const session = this.sessions.get(recordingSessionId);
    if (!session) {
      throw new RecordingException(`Session ${recordingSessionId} not found`);
    }
    return session;
  }

  update(
    recordingSessionId: string,
    updates: Partial<RecordingSession>,
  ): RecordingSession {
    const session = this.get(recordingSessionId);
    Object.assign(session, updates);
    return session;
  }

  delete(recordingSessionId: string): void {
    const session = this.get(recordingSessionId);
    this.sessions.delete(recordingSessionId);
    this.meetingToSession.delete(session.meetingId);
  }

  getByMeetingId(meetingId: string): RecordingSession | null {
    const sessionId = this.meetingToSession.get(meetingId);
    return sessionId ? (this.sessions.get(sessionId) ?? null) : null;
  }

  isSessionActive(meetingId: string): boolean {
    const session = this.getByMeetingId(meetingId);
    return session ? session.status === SessionStatus.ACTIVE : false;
  }
}
