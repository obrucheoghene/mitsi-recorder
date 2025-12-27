import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RecordingModule } from './recording/recording.module';
import { HealthModule } from './health/health.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RecordingModule,
    HealthModule,
  ],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
