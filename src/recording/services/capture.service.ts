import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';

@Injectable()
export class CaptureService {
  private readonly logger = new Logger(CaptureService.name);

  async mergeAudioVideo(
    videoPath: string,
    audioPath: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-i',
        videoPath,
        '-i',
        audioPath,
        '-c:v',
        'copy',
        '-c:a',
        'copy',
        '-shortest',
        '-y',
        outputPath,
      ]);

      proc.stderr?.on('data', (data: Buffer) => {
        this.logger.debug(`FFmpeg merge: ${data.toString().trim()}`);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`Merge complete → ${outputPath}`);
          resolve();
        } else {
          reject(new Error(`FFmpeg merge exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`FFmpeg merge error: ${err.message}`));
      });
    });
  }
}
