import { Module } from '@nestjs/common';
import { RecordingController } from './recording.controller';
import { RecordingService } from './services/recording.service';
import { SessionService } from './services/session.service';
import { BrowserService } from './services/browser.service';
import { CaptureService } from './services/capture.service';
import { StorageService } from './services/storage.service';

@Module({
  controllers: [RecordingController],
  providers: [
    RecordingService,
    SessionService,
    BrowserService,
    CaptureService,
    StorageService,
  ],
  exports: [RecordingService, StorageService],
})
export class RecordingModule {}
