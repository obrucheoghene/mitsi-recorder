import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { RecordingService } from './services/recording.service';
import { StartRecordingDto } from './dto/start-recording.dto';
import { StopRecordingDto } from './dto/stop-recording.dto';

@Controller('recording')
export class RecordingController {
  constructor(private readonly recordingService: RecordingService) {}

  @Post('start')
  async start(@Body() dto: StartRecordingDto) {
    return this.recordingService.startRecording(dto);
  }

  @Post('stop')
  async stop(@Body() dto: StopRecordingDto) {
    return this.recordingService.stopRecording(dto);
  }

  @Get('status/:sessionId')
  async status(@Param('sessionId') sessionId: string) {
    return this.recordingService.getStatus(sessionId);
  }
}
