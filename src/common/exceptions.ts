export class RecordingException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordingException';
  }
}

export class BrowserException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserException';
  }
}
