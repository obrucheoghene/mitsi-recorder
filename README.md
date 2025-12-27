# Mitsi Recording & Streaming Service

A headless browser-based WebRTC recording and streaming microservice for Mitsi video conferencing.

## Features

- **Record**, **Stream**, or **Record + Stream** simultaneously
- Single meeting per instance
- Headless browser automation with Playwright
- System audio capture via FFmpeg
- RTMP/HLS streaming support
- Automatic handoff to merging service
- Production-ready error handling

## Quick Start

### Prerequisites

- Node.js 18+
- FFmpeg
- Chromium (installed via Playwright)

### Installation

```bash
npm install
npm run build
```

### Development

```bash
npm run dev
```

Service runs on `http://localhost:3000`

### Environment Variables

```env
PORT=3000
LOCAL_CLIENT_URL=http://localhost:5173
TEMP_RECORDING_DIR=/tmp/mitsi-recordings
MERGING_SERVICE_URL=http://localhost:3001
CLEANUP_AFTER_MERGE=true
```

## API Endpoints

### Start Recording

```bash
POST /recording/start
Content-Type: application/json

{
  "meetingId": "room-123",
  "userId": "user-456",
  "mode": "record_stream",
  "streamUrl": "rtmp://live.youtube.com/rtmp/..."
}
```

### Stop Recording

```bash
POST /recording/stop
Content-Type: application/json

{
  "recordingSessionId": "uuid-xxxx"
}
```

### Check Status

```bash
GET /recording/status/:recordingSessionId
```

### Health Check

```bash
GET /health
GET /health/ready
```

## Docker Deployment

```bash
docker-compose up
```

## Architecture

- **BrowserService**: Playwright headless browser management
- **SessionService**: Session state tracking
- **AudioCaptureService**: FFmpeg-based audio recording
- **StreamingService**: RTMP/HLS streaming pipeline
- **RecordingService**: Main orchestration
- **MergingServiceClient**: HTTP integration with merging service

## Error Handling

- Graceful shutdown on module destroy
- Automatic session cleanup on errors
- Global exception filter for consistent responses
- Health checks for readiness probes
