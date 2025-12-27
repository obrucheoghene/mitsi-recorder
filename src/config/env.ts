export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  LOCAL_CLIENT_URL: string;
  TEMP_RECORDING_DIR: string;
  VIDEO_QUALITY: string;
  VIDEO_FPS: number;
  AUDIO_CODEC: string;
  MERGING_SERVICE_URL: string;
  MERGING_SERVICE_TIMEOUT: number;
  MAX_SESSION_DURATION: number;
  CLEANUP_AFTER_MERGE: boolean;
}

export function getEnvConfig(): EnvConfig {
  return {
    PORT: parseInt(process.env.PORT || '3000'),
    NODE_ENV: process.env.NODE_ENV || 'development',

    LOCAL_CLIENT_URL: process.env.LOCAL_CLIENT_URL || 'http://localhost:5173',

    TEMP_RECORDING_DIR:
      process.env.TEMP_RECORDING_DIR || '/tmp/mitsi-recordings',

    VIDEO_QUALITY: process.env.VIDEO_QUALITY || '720p',
    VIDEO_FPS: parseInt(process.env.VIDEO_FPS || '30'),
    AUDIO_CODEC: process.env.AUDIO_CODEC || 'aac',
    MERGING_SERVICE_URL:
      process.env.MERGING_SERVICE_URL || 'http://localhost:3001',
    MERGING_SERVICE_TIMEOUT: parseInt(
      process.env.MERGING_SERVICE_TIMEOUT || '300000',
    ),
    MAX_SESSION_DURATION: parseInt(
      process.env.MAX_SESSION_DURATION || '21600000',
    ),
    CLEANUP_AFTER_MERGE: process.env.CLEANUP_AFTER_MERGE === 'true',
  };
}
