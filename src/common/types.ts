export type RecordingMode = 'record' | 'stream' | 'record_stream';

export enum SessionStatus {
  STARTING = 'STARTING',
  ACTIVE = 'ACTIVE',
  STOPPING = 'STOPPING',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
}

export interface RecordingSession {
  recordingSessionId: string;
  meetingId: string;
  userId: string;
  mode: RecordingMode;
  status: SessionStatus;
  startTime: Date;
  endTime?: Date;
  videoPath?: string;
  audioPath?: string;
  streamUrl?: string;
  error?: string;
}
