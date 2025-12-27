import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../recording/services/session.service';
import { getEnvConfig } from '../config/env';
import * as fs from 'fs';

@Injectable()
export class HealthService {
  private logger = new Logger(HealthService.name);
  private config = getEnvConfig();
  private startTime = Date.now();

  constructor(private sessionService: SessionService) {}

  check() {
    const uptime = Date.now() - this.startTime;
    const diskSpace = this.getDiskSpace();

    return {
      status: 'ok',
      uptime: Math.floor(uptime / 1000),
      timestamp: new Date().toISOString(),
      diskSpace,
    };
  }

  ready() {
    try {
      // Check if temp directory exists and is writable
      const tempDir = this.config.TEMP_RECORDING_DIR;
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Test write access
      const testFile = `${tempDir}/.health-check`;
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);

      return { ready: true };
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Readiness check failed: ${error.message}`);
        return { ready: false, error: error.message };
      }
    }
  }

  private getDiskSpace(): { used: string; free: string } {
    try {
      const tempDir = this.config.TEMP_RECORDING_DIR;
      const stats = fs.statSync(tempDir);
      return {
        used: this.formatBytes(stats.size),
        free: 'N/A',
      };
    } catch {
      return { used: 'N/A', free: 'N/A' };
    }
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}
