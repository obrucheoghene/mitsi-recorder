import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserException } from '../../common/exceptions';
import { getEnvConfig } from '../../config/env';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private browser: Browser | null = null;
  private contexts = new Map<string, BrowserContext>();
  private pages = new Map<string, Page>();
  private config = getEnvConfig();

  async launchBrowser(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: false,
        args: [
          '--use-fake-ui-for-media-stream',
          '--allow-running-insecure-content',
          '--no-sandbox',
          '--autoplay-policy=no-user-gesture-required',
          '--disable-dev-shm-usage',
        ],
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new BrowserException(`Failed to launch browser: ${errMsg}`);
    }
  }

  async createContext(sessionId: string): Promise<BrowserContext> {
    if (!this.browser) {
      await this.launchBrowser();
    }

    try {
      const recordingDir = path.join(this.config.TEMP_RECORDING_DIR, sessionId);
      fs.mkdirSync(recordingDir, { recursive: true });

      const context = await this.browser!.newContext({
        recordVideo: {
          dir: recordingDir,
          size: { width: 1280, height: 720 },
        },
      });

      this.contexts.set(sessionId, context);
      return context;
    } catch (error) {
      if (error instanceof Error)
        throw new BrowserException(
          `Failed to create context: ${error.message}`,
        );
      throw new BrowserException(`Failed to create context: ${String(error)}`);
    }
  }

  async createPage(sessionId: string, clientUrl: string): Promise<Page> {
    const context = this.contexts.get(sessionId);
    if (!context) {
      throw new BrowserException(`Context ${sessionId} not found`);
    }

    try {
      const page = await context.newPage();
      this.pages.set(sessionId, page);

      await page.goto(clientUrl, { waitUntil: 'networkidle' });
      return page;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new BrowserException(`Failed to create page: ${errMsg}`);
    }
  }

  async joinMeeting(
    sessionId: string,
    meetingId: string,
    userId: string,
  ): Promise<void> {
    const page = this.pages.get(sessionId);
    if (!page) {
      throw new BrowserException(`Page ${sessionId} not found`);
    }

    try {
      await page.evaluate(
        ({ meetingId, userId }) => {
          (
            window as Window & {
              mitsiConfig?: {
                meetingId: string;
                userId: string;
                autoJoin: boolean;
              };
            }
          ).mitsiConfig = { meetingId, userId, autoJoin: true };
        },
        { meetingId, userId },
      );

      await page.waitForFunction(
        () =>
          (window as Window & { mitsiJoined?: boolean }).mitsiJoined === true,
        {
          timeout: 15000,
        },
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new BrowserException(`Failed to join meeting: ${errMsg}`);
    }
  }

  async closePage(sessionId: string): Promise<void> {
    const page = this.pages.get(sessionId);
    if (page) {
      await page.close();
      this.pages.delete(sessionId);
    }
  }

  async closeContext(sessionId: string): Promise<{ videoPath: string }> {
    const context = this.contexts.get(sessionId);
    if (!context) {
      throw new BrowserException(`Context ${sessionId} not found`);
    }

    try {
      // Playwright exposes video() on Page, not on BrowserContext.
      const page = this.pages.get(sessionId);
      let videoPath = '';

      if (page) {
        const video = page.video?.();
        if (video) {
          try {
            const p = await video.path();
            videoPath = p ?? '';
          } catch {
            // ignore errors getting video path
          }
        }

        // ensure page is closed and removed
        try {
          await page.close();
        } catch {
          // ignore page close errors
        }
        this.pages.delete(sessionId);
      }

      await context.close();
      this.contexts.delete(sessionId);

      return { videoPath };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new BrowserException(`Failed to close context: ${errMsg}`);
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  getPage(sessionId: string): Page | null {
    return this.pages.get(sessionId) || null;
  }
}
