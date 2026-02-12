export enum SessionStatus {
  QUEUED = 'QUEUED',
  STARTING = 'STARTING',
  ACTIVE = 'ACTIVE',
  STOPPING = 'STOPPING',
  STOPPED = 'STOPPED',
  FAILED = 'FAILED',
}

export interface RecordingSession {
  sessionId: string;
  meetingId: string;
  status: SessionStatus;
  startedAt: string;
  stoppedAt?: string;
  outputPath?: string;
  error?: string;
}
