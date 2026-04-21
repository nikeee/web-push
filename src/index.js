const vapidHelper = require('./vapid-helper.js');
const encryptionHelper = require('./encryption-helper.js');
const WebPushLib = require('./web-push-lib.js');
const WebPushError = require('./web-push-error.js');
const WebPushConstants = require('./web-push-constants.js');

export default {
  WebPushLib,
  WebPushError,
  supportedContentEncodings: WebPushConstants.supportedContentEncodings,
  encrypt: encryptionHelper.encrypt,
  getVapidHeaders: vapidHelper.getVapidHeaders,
  generateVAPIDKeys: vapidHelper.generateVAPIDKeys,
};
