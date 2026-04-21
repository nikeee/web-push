export default class WebPushError extends Error {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  endpoint: string;

  constructor(message: string, statusCode: number, headers: Record<string, string>, body: string, endpoint: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.headers = headers;
    this.body = body;
    this.endpoint = endpoint;
  }
}
