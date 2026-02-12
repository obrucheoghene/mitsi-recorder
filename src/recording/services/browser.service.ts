import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserException } from '../../common/exceptions';

@Injectable()
export class BrowserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private browser: Browser | null = null;
  private activePage: Page | null = null;
  private activeContext: BrowserContext | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.launchBrowser();
  }

  async onModuleDestroy() {
    await this.closeActivePage();
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.log('Browser closed');
    }
  }

  private async launchBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--use-fake-ui-for-media-stream',
        '--allow-running-insecure-content',
        '--no-sandbox',
        '--autoplay-policy=no-user-gesture-required',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    this.logger.log('Browser launched');
  }

  async createRecordingPage(
    sessionId: string,
    meetingId: string,
    videoDir: string,
  ): Promise<void> {
    if (!this.browser) {
      throw new BrowserException('Browser not initialized');
    }

    const context = await this.browser.newContext({
      recordVideo: {
        dir: videoDir,
        size: { width: 1280, height: 720 },
      },
      permissions: ['microphone', 'camera'],
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    this.activeContext = context;
    this.activePage = page;

    const webUrl = this.configService.get<string>('mitsi.webUrl');
    const apiKey = this.configService.get<string>('mitsi.apiKey');
    const meetingUrl = `${webUrl}/${meetingId}`;

    await page.addInitScript(
      ({ apiKey: key }) => {
        (window as any).mitsiConfig = {
          autoJoin: true,
          userName: 'Mitsi Recorder',
          isRecorder: true,
          apiKey: key,
        };
      },
      { apiKey },
    );

    this.logger.log(`Navigating to ${meetingUrl}`);
    await page.goto(meetingUrl, { waitUntil: 'networkidle' });

    // Wait for the bot to join the meeting
    await page.waitForFunction(
      () => (window as any).mitsiJoined === true,
      { timeout: 30000 },
    ).catch(() => {
      this.logger.warn(
        'mitsiJoined flag not detected within 30s, continuing anyway',
      );
    });

    this.logger.log(`Recording page created for session: ${sessionId}`);
  }

  async closeActivePage(): Promise<string | null> {
    let videoPath: string | null = null;

    if (this.activePage) {
      const video = this.activePage.video();
      await this.activePage.close();
      if (video) {
        videoPath = await video.path();
      }
      this.activePage = null;
    }

    if (this.activeContext) {
      await this.activeContext.close();
      this.activeContext = null;
    }

    if (videoPath) {
      this.logger.log(`Video saved at: ${videoPath}`);
    }

    return videoPath;
  }

  isPageActive(): boolean {
    return this.activePage !== null;
  }
}
