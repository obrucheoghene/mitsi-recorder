import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { RecordingException } from '../../common/exceptions';
import { getEnvConfig } from '../../config/env';

@Injectable()
export class StreamingService {
  private logger = new Logger(StreamingService.name);
  private config = getEnvConfig();
  private streamingProcesses = new Map<string, ChildProcess>();

  async startStreaming(
    sessionId: string,
    page: Page,
    streamUrl?: string,
  ): Promise<void> {
    if (!streamUrl) {
      throw new RecordingException('Stream URL is required for streaming mode');
    }

    this.logger.log(`Starting stream to ${streamUrl}`);

    try {
      // Capture page content and pipe to ffmpeg
      const screencastPath = this.getScreencastPath(sessionId);
      fs.mkdirSync(path.dirname(screencastPath), { recursive: true });

      const ffmpegProcess = this.startFFmpegStream(screencastPath, streamUrl);
      this.streamingProcesses.set(sessionId, ffmpegProcess);

      // Inject streaming script into page
      await page.evaluate(() => {
        (window as Window & { streamingActive?: boolean }).streamingActive =
          true;
        console.log('[Streaming] Streaming started');
      });

      this.logger.log(`Stream started for ${sessionId}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new RecordingException(`Failed to start streaming: ${errMsg}`);
    }
  }

  async stopStreaming(sessionId: string): Promise<void> {
    this.logger.log(`Stopping stream for ${sessionId}`);

    const process = this.streamingProcesses.get(sessionId);
    if (process && !process.killed) {
      return new Promise((resolve) => {
        process.on('exit', () => {
          this.streamingProcesses.delete(sessionId);
          this.logger.log(`Stream stopped for ${sessionId}`);
          resolve();
        });

        process.kill('SIGTERM');

        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);
      });
    }
  }

  private startFFmpegStream(
    inputPath: string,
    streamUrl: string,
  ): ChildProcess {
    const ffmpegArgs = [
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=1280x720:d=21600',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-b:v',
      '2000k',
      '-f',
      'flv',
      streamUrl,
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    ffmpeg.stderr.on('data', (data: Buffer | string) => {
      const text = typeof data === 'string' ? data : data.toString();
      this.logger.debug(`Stream FFmpeg: ${text.trim()}`);
    });

    ffmpeg.on('error', (error) => {
      this.logger.error(`Stream FFmpeg error: ${error.message}`);
    });

    return ffmpeg;
  }

  private getScreencastPath(sessionId: string): string {
    return path.join(
      this.config.TEMP_RECORDING_DIR,
      sessionId,
      'screencast.mp4',
    );
  }
}
