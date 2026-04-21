export default class WebPushError extends Error {
  constructor(message, statusCode, headers, body, endpoint) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.headers = headers;
    this.body = body;
    this.endpoint = endpoint;
  }
};
