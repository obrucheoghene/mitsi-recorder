import { IsNotEmpty, IsString } from 'class-validator';

export class StartRecordingDto {
  @IsString()
  @IsNotEmpty()
  meetingId: string;
}
