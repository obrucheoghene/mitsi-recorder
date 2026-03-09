import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RecordingService } from '../recording/services/recording.service';
import { StorageService } from '../recording/services/storage.service';

@Injectable()
export class HealthService {
  private readonly redis: Redis;
  private readonly startTime = Date.now();

  constructor(
    private readonly configService: ConfigService,
    private readonly recordingService: RecordingService,
    private readonly storageService: StorageService,
  ) {
    this.redis = new Redis(this.configService.get<string>('redis.url')!);
  }

  async getHealth() {
    const redisStatus = await this.checkRedis();

    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      busy: this.recordingService.isBusy(),
      redis: redisStatus,
    };
  }

  async getReady() {
    const redisOk = await this.checkRedis();
    const storageOk = this.storageService.recordingsDirExists();
    const available = !this.recordingService.isBusy();

    return {
      ready: redisOk && storageOk && available,
      redis: redisOk,
      storage: storageOk,
      available,
    };
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
