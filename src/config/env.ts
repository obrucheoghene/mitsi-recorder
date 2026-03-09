import * as path from 'path';

export default () => ({
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  mitsi: {
    webUrl: process.env.MITSI_WEB_URL || 'http://localhost:5173',
    apiKey: process.env.MITSI_API_KEY || '',
  },

  recording: {
    dir: process.env.RECORDINGS_DIR || path.join(process.cwd(), 'recordings'),
    maxDurationMs: parseInt(
      process.env.MAX_RECORDING_DURATION_MS || '21600000',
      10,
    ),
  },
});
