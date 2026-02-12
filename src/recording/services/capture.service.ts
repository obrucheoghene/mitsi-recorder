import { Injectable, Logger } from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';

@Injectable()
export class CaptureService {
  private readonly logger = new Logger(CaptureService.name);
  private ffmpegProcess: ChildProcess | null = null;

  async startCapture(sessionId: string, outputDir: string): Promise<string> {
    const audioPath = path.join(outputDir, `${sessionId}-audio.aac`);

    this.ffmpegProcess = spawn('ffmpeg', [
      '-f',
      'pulse',
      '-i',
      'default',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-y',
      audioPath,
    ]);

    this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
      this.logger.debug(`FFmpeg: ${data.toString().trim()}`);
    });

    this.ffmpegProcess.on('error', (err) => {
      this.logger.error(`FFmpeg process error: ${err.message}`);
    });

    this.logger.log(`Audio capture started: ${audioPath}`);
    return audioPath;
  }

  async stopCapture(): Promise<void> {
    if (!this.ffmpegProcess) return;

    return new Promise<void>((resolve) => {
      this.ffmpegProcess!.on('close', () => {
        this.ffmpegProcess = null;
        this.logger.log('Audio capture stopped');
        resolve();
      });

      // Send SIGINT for graceful shutdown (FFmpeg finalizes the file)
      this.ffmpegProcess!.kill('SIGINT');

      // Force kill after 10s if it doesn't exit
      setTimeout(() => {
        if (this.ffmpegProcess) {
          this.ffmpegProcess.kill('SIGKILL');
          this.ffmpegProcess = null;
          this.logger.warn('FFmpeg force killed');
          resolve();
        }
      }, 10000);
    });
  }

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
        'aac',
        '-shortest',
        '-y',
        outputPath,
      ]);

      proc.stderr?.on('data', (data: Buffer) => {
        this.logger.debug(`FFmpeg merge: ${data.toString().trim()}`);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`Merge complete: ${outputPath}`);
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

  isCapturing(): boolean {
    return this.ffmpegProcess !== null;
  }
}
