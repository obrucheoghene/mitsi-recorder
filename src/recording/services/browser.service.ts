import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserException } from '../../common/exceptions';

@Injectable()
export class BrowserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private browser: Browser | null = null;
  private activePage: Page | null = null;
  private activeContext: BrowserContext | null = null;
  private audioWriteStream: fs.WriteStream | null = null;
  private activeAudioPath: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.launchBrowser();
  }

  async onModuleDestroy() {
    await this.stopAudioCapture().catch(() => {});
    await this.closeActivePage().catch(() => {});
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

    // If the browser crashes or is killed externally, clear the reference so
    // the next createRecordingPage call re-launches rather than calling
    // newContext on a dead process.
    this.browser.once('disconnected', () => {
      this.logger.warn('Browser disconnected; will relaunch on next recording');
      this.browser = null;
    });

    this.logger.log('Browser launched');
  }

  async createRecordingPage(
    sessionId: string,
    meetingId: string,
    videoDir: string,
  ): Promise<void> {
    if (!this.browser) {
      this.logger.warn('Browser not running; relaunching before recording');
      await this.launchBrowser();
    }

    const context = await this.browser!.newContext({
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

    await page
      .waitForFunction(() => (window as any).mitsiJoined === true, {
        timeout: 30000,
      })
      .catch(() => {
        this.logger.warn(
          'mitsiJoined flag not detected within 30s, continuing anyway',
        );
      });

    this.logger.log(`Recording page ready: session=${sessionId}`);
  }

  /**
   * Injects a MediaRecorder into the page that captures all WebRTC audio
   * streams. Audio chunks are streamed back to Node.js via exposeFunction
   * and written directly to disk — no OS audio device needed.
   */
  async startAudioCapture(
    sessionId: string,
    outputDir: string,
  ): Promise<string> {
    if (!this.activePage) {
      throw new BrowserException('No active page for audio capture');
    }

    const audioPath = path.join(outputDir, `${sessionId}-audio.webm`);
    this.activeAudioPath = audioPath;
    this.audioWriteStream = fs.createWriteStream(audioPath);

    // Expose a Node.js callback the browser can call to stream chunks to disk
    await this.activePage.exposeFunction(
      '__saveAudioChunk',
      (base64: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          const buffer = Buffer.from(base64, 'base64');
          this.audioWriteStream!.write(buffer, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
    );

    // Inject the MediaRecorder script into the live page
    await this.activePage.evaluate(async () => {
      const audioCtx = new AudioContext();
      // AudioContext starts suspended even with --autoplay-policy flag; resume it
      await audioCtx.resume();
      const dest = audioCtx.createMediaStreamDestination();

      // Track connected elements to avoid double-connecting
      const connected = new WeakSet<HTMLMediaElement>();

      const connectElement = (el: HTMLMediaElement) => {
        if (connected.has(el) || !el.srcObject) return;
        const stream = el.srcObject as MediaStream;
        // Only connect streams that actually carry audio
        if (stream.getAudioTracks().length === 0) return;
        connected.add(el);
        try {
          // createMediaStreamSource doesn't take exclusive ownership of the
          // element, so it won't interfere with existing AudioContext nodes
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(dest);
        } catch {
          // Stream may have ended — skip
        }
      };

      const scanAll = () =>
        document
          .querySelectorAll<HTMLMediaElement>('audio, video')
          .forEach(connectElement);

      // Connect media elements already in the DOM
      scanAll();

      // Watch for elements added later (new peers joining)
      new MutationObserver(scanAll).observe(document.body, {
        childList: true,
        subtree: true,
      });

      // MutationObserver doesn't fire when srcObject is assigned on an existing
      // element — poll every second to catch those late assignments
      (window as any).__audioPollInterval = setInterval(scanAll, 1000);

      // Start recording the mixed audio stream
      const recorder = new MediaRecorder(dest.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size === 0) return;
        const reader = new FileReader();
        reader.onload = () => {
          // Strip the "data:...;base64," prefix and send raw base64 to Node
          const b64 = (reader.result as string).split(',')[1];
          (window as any).__saveAudioChunk(b64);
        };
        reader.readAsDataURL(e.data);
      };

      // Flush a chunk every 3 seconds so we write incrementally to disk
      recorder.start(3000);
      (window as any).__mediaRecorder = recorder;
    });

    this.logger.log(`Browser audio capture started → ${audioPath}`);
    return audioPath;
  }

  /**
   * Stops the in-page MediaRecorder, waits for the final chunk to be written,
   * then closes the write stream.
   */
  async stopAudioCapture(): Promise<string | null> {
    if (!this.activePage || !this.audioWriteStream) return null;

    // Tell the MediaRecorder to stop; wait for onstop so the final
    // ondataavailable fires and all chunks have been sent to __saveAudioChunk
    await this.activePage
      .evaluate(() => {
        clearInterval((window as any).__audioPollInterval);
        return new Promise<void>((resolve) => {
          const rec = (window as any).__mediaRecorder;
          if (!rec || rec.state === 'inactive') {
            resolve();
            return;
          }
          rec.onstop = () => resolve();
          rec.stop();
        });
      })
      .catch((err) => {
        this.logger.warn(`Could not stop MediaRecorder: ${err?.message}`);
      });

    // Allow any pending __saveAudioChunk promises to complete
    await new Promise((r) => setTimeout(r, 500));

    // Close the write stream
    await new Promise<void>((resolve, reject) => {
      this.audioWriteStream!.end((err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const audioPath = this.activeAudioPath;
    this.audioWriteStream = null;
    this.activeAudioPath = null;

    this.logger.log(`Browser audio capture stopped → ${audioPath}`);
    return audioPath;
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
      this.logger.log(`Video saved → ${videoPath}`);
    }

    return videoPath;
  }

  isPageActive(): boolean {
    return this.activePage !== null;
  }
}
