export default () => ({
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    sqsQueueUrl: process.env.AWS_SQS_QUEUE_URL || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  sqs: {
    visibilityTimeout: parseInt(
      process.env.SQS_VISIBILITY_TIMEOUT || '28800',
      10,
    ),
    pollWaitSeconds: parseInt(process.env.SQS_POLL_WAIT_SECONDS || '20', 10),
  },

  mitsi: {
    webUrl: process.env.MITSI_WEB_URL || 'http://localhost:5173',
    apiKey: process.env.MITSI_API_KEY || '',
  },

  recording: {
    dir: process.env.RECORDINGS_DIR || '/tmp/mitsi-recordings',
    maxDurationMs: parseInt(
      process.env.MAX_RECORDING_DURATION_MS || '21600000',
      10,
    ),
  },
});
