import { Module } from '@nestjs/common';
import { RecordingController } from './recording.controller';
import { RecordingService } from './services/recording.service';
import { BrowserService } from './services/browser.service';
import { SessionService } from './services/session.service';
import { StreamingService } from './services/streaming.service';
import { AudioCaptureService } from './services/audio-capture.service';
import { CleanupService } from './services/cleanup.service';
// import { MergingServiceClient } from './clients/merging-service.client';

@Module({
  controllers: [RecordingController],
  providers: [
    RecordingService,
    BrowserService,
    SessionService,
    StreamingService,
    AudioCaptureService,
    CleanupService,
    // MergingServiceClient,
  ],
  exports: [SessionService],
})
export class RecordingModule {}
