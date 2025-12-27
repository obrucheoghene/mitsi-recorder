import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { RecordingException } from '../../common/exceptions';
import { getEnvConfig } from '../../config/env';

@Injectable()
export class AudioCaptureService {
  private logger = new Logger(AudioCaptureService.name);
  private config = getEnvConfig();
  private audioProcesses = new Map<string, ChildProcessWithoutNullStreams>();

  startAudioCapture(sessionId: string, browserPid: number): string {
    const audioDir = path.join(this.config.TEMP_RECORDING_DIR, sessionId);
    fs.mkdirSync(audioDir, { recursive: true });

    const audioPath = path.join(audioDir, 'audio.webm');

    try {
      const process = this.spawnAudioProcess(browserPid, audioPath);
      this.audioProcesses.set(sessionId, process);
      this.logger.log(`Audio capture started: ${sessionId}`);
      return audioPath;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new RecordingException(`Failed to start audio capture: ${errMsg}`);
    }
  }

  private spawnAudioProcess(
    browserPid: number,
    outputPath: string,
  ): ChildProcessWithoutNullStreams {
    // Use ffmpeg to capture system audio from browser process
    const ffmpegArgs = [
      '-f',
      'pulse', // Linux audio source
      '-i',
      'default', // Default audio device
      '-c:a',
      'libopus', // Opus codec for WebM
      '-b:a',
      '128k', // Audio bitrate
      '-t',
      '21600', // Max 6 hours
      outputPath,
    ];

    const ffmpeg: ChildProcessWithoutNullStreams = spawn('ffmpeg', ffmpegArgs);

    ffmpeg.stderr.on('data', (data: Buffer | string) => {
      const text = typeof data === 'string' ? data : data.toString();
      this.logger.debug(`FFmpeg: ${text.trim()}`);
    });

    ffmpeg.on('error', (error) => {
      this.logger.error(`Audio capture error: ${error.message}`);
    });

    return ffmpeg;
  }

  async stopAudioCapture(sessionId: string): Promise<void> {
    const process = this.audioProcesses.get(sessionId);

    if (process) {
      return new Promise<void>((resolve) => {
        process.on('exit', () => {
          this.audioProcesses.delete(sessionId);
          this.logger.log(`Audio capture stopped: ${sessionId}`);
          resolve();
        });

        process.kill('SIGTERM');

        setTimeout(() => {
          if (process.killed === false) {
            process.kill('SIGKILL');
          }
        }, 5000);
      });
    }
  }

  getAudioPath(sessionId: string): string {
    return path.join(this.config.TEMP_RECORDING_DIR, sessionId, 'audio.webm');
  }
}
