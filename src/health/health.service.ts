import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { StorageService } from '../recording/services/storage.service';
import { QueueConsumerService } from '../queue/queue-consumer.service';

@Injectable()
export class HealthService {
  private readonly redis: Redis;
  private readonly startTime = Date.now();

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly queueConsumerService: QueueConsumerService,
  ) {
    this.redis = new Redis(this.configService.get<string>('redis.url')!);
  }

  async getHealth() {
    const redisStatus = await this.checkRedis();

    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      recording: this.queueConsumerService.isBusy(),
      redis: redisStatus,
    };
  }

  async getReady() {
    const redisOk = await this.checkRedis();
    const storageOk = this.storageService.recordingsDirExists();

    const ready = redisOk && storageOk;
    return {
      ready,
      redis: redisOk,
      storage: storageOk,
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
