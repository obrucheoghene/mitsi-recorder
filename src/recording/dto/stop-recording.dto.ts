import { IsNotEmpty, IsString } from 'class-validator';

export class StopRecordingDto {
  @IsString()
  @IsNotEmpty()
  meetingId: string;
}
