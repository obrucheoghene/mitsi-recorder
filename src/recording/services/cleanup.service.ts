import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getEnvConfig } from '../../config/env';

@Injectable()
export class CleanupService {
  private logger = new Logger(CleanupService.name);
  private config = getEnvConfig();

  cleanupSession(sessionId: string): void {
    const sessionDir = path.join(this.config.TEMP_RECORDING_DIR, sessionId);

    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        this.logger.log(`Cleaned up session directory: ${sessionId}`);
      }
    } catch (error) {
      if (error instanceof Error)
        this.logger.error(
          `Failed to cleanup session ${sessionId}: ${error.message}`,
        );
      this.logger.error(
        `Failed to cleanup session ${sessionId}: ${String(error)}`,
      );
    }
  }

  cleanupOldSessions(maxAge: number = 86400000): void {
    const recordingDir = this.config.TEMP_RECORDING_DIR;

    try {
      if (!fs.existsSync(recordingDir)) return;

      const now = Date.now();
      const dirs = fs.readdirSync(recordingDir);

      dirs.forEach((dir) => {
        const fullPath = path.join(recordingDir, dir);
        const stats = fs.statSync(fullPath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          this.logger.log(`Cleaned up old session: ${dir}`);
        }
      });
    } catch (error) {
      if (error instanceof Error)
        this.logger.error(`Failed to cleanup old sessions: ${error.message}`);
      this.logger.error(`Failed to cleanup old sessions: ${String(error)}`);
    }
  }
}
