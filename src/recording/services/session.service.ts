import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { RecordingSession, SessionStatus } from '../../common/types';

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis(this.configService.get<string>('redis.url')!);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async createSession(meetingId: string): Promise<RecordingSession> {
    const sessionId = uuidv4();
    const session: RecordingSession = {
      sessionId,
      meetingId,
      status: SessionStatus.QUEUED,
      startedAt: new Date().toISOString(),
    };

    await this.redis.set(
      this.sessionKey(sessionId),
      JSON.stringify(session),
    );
    await this.redis.set(this.meetingKey(meetingId), sessionId);

    this.logger.log(
      `Session created: ${sessionId} for meeting: ${meetingId}`,
    );
    return session;
  }

  async getSession(sessionId: string): Promise<RecordingSession | null> {
    const data = await this.redis.get(this.sessionKey(sessionId));
    if (!data) return null;
    return JSON.parse(data);
  }

  async getSessionByMeetingId(
    meetingId: string,
  ): Promise<RecordingSession | null> {
    const sessionId = await this.redis.get(this.meetingKey(meetingId));
    if (!sessionId) return null;
    return this.getSession(sessionId);
  }

  async updateSession(
    sessionId: string,
    update: Partial<RecordingSession>,
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const updated = { ...session, ...update };
    await this.redis.set(this.sessionKey(sessionId), JSON.stringify(updated));
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    await this.redis.del(this.sessionKey(sessionId));
    await this.redis.del(this.meetingKey(session.meetingId));
  }

  private sessionKey(sessionId: string): string {
    return `recording:session:${sessionId}`;
  }

  private meetingKey(meetingId: string): string {
    return `recording:meeting:${meetingId}`;
  }
}
