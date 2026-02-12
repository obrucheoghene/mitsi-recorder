import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly recordingsDir: string;

  constructor(private readonly configService: ConfigService) {
    this.recordingsDir = this.configService.get<string>('recording.dir')!;
  }

  getOutputDir(sessionId: string): string {
    return path.join(this.recordingsDir, sessionId);
  }

  getOutputPath(sessionId: string): string {
    return path.join(this.getOutputDir(sessionId), `${sessionId}.mp4`);
  }

  ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      this.logger.log(`Created directory: ${dirPath}`);
    }
  }

  cleanupTempFiles(sessionId: string): void {
    const dir = this.getOutputDir(sessionId);
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      // Keep only the final .mp4 output
      if (!file.endsWith('.mp4') || file.includes('-audio')) {
        const filePath = path.join(dir, file);
        fs.unlinkSync(filePath);
        this.logger.debug(`Cleaned up: ${filePath}`);
      }
    }
  }

  recordingsDirExists(): boolean {
    try {
      fs.accessSync(this.recordingsDir, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}
