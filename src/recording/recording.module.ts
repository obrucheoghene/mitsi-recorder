import { Module } from '@nestjs/common';
import { RecordingController } from './recording.controller';
import { RecordingService } from './services/recording.service';
import { SessionService } from './services/session.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [RecordingController],
  providers: [RecordingService, SessionService],
})
export class RecordingModule {}
