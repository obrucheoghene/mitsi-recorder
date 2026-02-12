import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';
import Redis from 'ioredis';
import { QueueConsumerService } from './queue-consumer.service';
import { BrowserService } from '../recording/services/browser.service';
import { CaptureService } from '../recording/services/capture.service';
import { SessionService } from '../recording/services/session.service';
import { StorageService } from '../recording/services/storage.service';

export const SQS_CLIENT = 'SQS_CLIENT';
export const REDIS_SUBSCRIBER = 'REDIS_SUBSCRIBER';

@Module({
  providers: [
    {
      provide: SQS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const region = configService.get<string>('aws.region');
        const accessKeyId = configService.get<string>('aws.accessKeyId');
        const secretAccessKey = configService.get<string>(
          'aws.secretAccessKey',
        );

        const config: any = { region };
        if (accessKeyId && secretAccessKey) {
          config.credentials = { accessKeyId, secretAccessKey };
        }

        return new SQSClient(config);
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: (configService: ConfigService) => {
        return new Redis(configService.get<string>('redis.url')!);
      },
      inject: [ConfigService],
    },
    QueueConsumerService,
    BrowserService,
    CaptureService,
    SessionService,
    StorageService,
  ],
  exports: [SQS_CLIENT, QueueConsumerService],
})
export class QueueModule {}
