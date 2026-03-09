import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RecordingModule } from '../recording/recording.module';

@Module({
  imports: [RecordingModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
