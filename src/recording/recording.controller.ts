import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RecordingService } from './services/recording.service';
import { StartRecordingDto, StopRecordingDto } from './dto/start-recording.dto';

@Controller('recording')
export class RecordingController {
  constructor(private recordingService: RecordingService) {}

  @Post('start')
  async startRecording(@Body() dto: StartRecordingDto) {
    try {
      const session = await this.recordingService.startRecording(dto);
      return {
        recordingSessionId: session.recordingSessionId,
        status: 'started',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new HttpException(errMsg, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('stop')
  async stopRecording(@Body() dto: StopRecordingDto) {
    try {
      const session = await this.recordingService.stopRecording(
        dto.recordingSessionId,
      );
      return {
        recordingSessionId: session.recordingSessionId,
        status: 'stopped',
        videoPath: session.videoPath,
        audioPath: session.audioPath,
        timestamp: new Date().toISOString(),
        mergingServiceInvoked: true,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new HttpException(errMsg, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('status/:recordingSessionId')
  getStatus(@Param('recordingSessionId') sessionId: string) {
    try {
      const session = this.recordingService.getStatus(sessionId);
      return {
        recordingSessionId: session.recordingSessionId,
        status: session.status,
        duration: session.endTime
          ? (session.endTime.getTime() - session.startTime.getTime()) / 1000
          : (Date.now() - session.startTime.getTime()) / 1000,
        meetingId: session.meetingId,
        mode: session.mode,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new HttpException(errMsg, HttpStatus.NOT_FOUND);
    }
  }
}
