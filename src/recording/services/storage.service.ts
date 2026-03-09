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
    return path.join(this.getOutputDir(sessionId), `${sessionId}.webm`);
  }

  ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      this.logger.log(`Created directory: ${dirPath}`);
    }
  }

  /**
   * Removes intermediate files produced during recording.
   * @param filePaths Explicit list of temp file paths to delete (e.g. the raw
   *   .webm and .aac files after a successful merge). Caller decides what is
   *   safe to remove so we never delete the only remaining output.
   */
  cleanupTempFiles(...filePaths: string[]): void {
    for (const filePath of filePaths) {
      if (fs.existsSync(filePath)) {
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
