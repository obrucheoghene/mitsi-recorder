export class StartRecordingDto {
  meetingId: string;
  userId: string;
  mode: 'record' | 'stream' | 'record_stream';
  streamUrl?: string;
}

export class StopRecordingDto {
  recordingSessionId: string;
}
