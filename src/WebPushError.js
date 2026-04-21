export default class WebPushError extends Error {
  /**
   * @param {string} message - The error message.
   * @param {number} statusCode - The HTTP status code from the push service.
   * @param {Object} headers - The response headers from the push service.
   * @param {string} body - The response body from the push service.
   * @param {string} endpoint - The endpoint URL of the push subscription.
   */
  constructor(message, statusCode, headers, body, endpoint) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.headers = headers;
    this.body = body;
    this.endpoint = endpoint;
  }
};
