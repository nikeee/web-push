import * as assert from "node:assert";
import { describe, test } from "node:test";

import { chromium, firefox } from "playwright";

import * as webPush from "../src/index.ts";
import createServer from "./helpers/create-server.js";

const vapidKeys = webPush.generateVAPIDKeys();

const PUSH_TEST_TIMEOUT = 120 * 1000;
const VAPID_PARAM = {
  subject: "mailto:web-push@mozilla.org",
  privateKey: vapidKeys.privateKey,
  publicKey: vapidKeys.publicKey,
};

webPush.setGCMAPIKey("AIzaSyAwmdX6KKd4hPfIcGU2SOfj9vuRDW6u-wo");

async function runTest(browserType, options) {
  options = options || {};

  const server = await createServer(options, webPush);
  const testServerURL = "http://127.0.0.1:" + server.port;

  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.grantPermissions(["notifications"], { origin: testServerURL });

    const page = await context.newPage();

    let url = testServerURL;
    if (options.vapid) {
      url += "?vapid=" + options.vapid.publicKey;
    }

    await page.goto(url);

    const serviceWorkerSupported = await page.evaluate(
      () => typeof navigator.serviceWorker !== "undefined",
    );
    assert(serviceWorkerSupported);

    await page.waitForFunction(() => typeof window.subscribeSuccess !== "undefined", null, {
      timeout: 60000,
    });

    const subscribeError = await page.evaluate(() => {
      if (!window.subscribeSuccess) {
        return window.subscribeError;
      }
      return null;
    });

    if (subscribeError) {
      console.log("subscribeError: ", subscribeError);
      throw new Error(
        typeof subscribeError === "string" ? subscribeError : JSON.stringify(subscribeError),
      );
    }

    const subscriptionJSON = await page.evaluate(() => window.testSubscription);
    if (!subscriptionJSON) {
      throw new Error("No subscription found.");
    }

    const subscription = JSON.parse(subscriptionJSON);

    const pushPayload = options.payload || null;
    const vapid = options.vapid || null;
    const contentEncoding = options.contentEncoding || null;

    if (pushPayload && !subscription.keys) {
      throw new Error("Require subscription.keys not found.");
    }

    const response = await webPush.sendNotification(subscription, pushPayload, {
      vapidDetails: vapid,
      contentEncoding: contentEncoding,
    });

    if (response.length > 0) {
      const data = JSON.parse(response);
      if (typeof data.failure !== "undefined" && data.failure > 0) {
        throw new Error("Bad GCM Response: " + response);
      }
    }

    const expectedTitle = options.payload ? options.payload : "no payload";
    await page.waitForFunction(title => document.title === title, expectedTitle, {
      timeout: 60000,
    });
  } finally {
    await browser.close();
    server.close();
  }
}

const browsers = [
  { name: "Chromium", type: chromium },
  { name: "Firefox", type: firefox },
];

for (const { name, type } of browsers) {
  describe(`Playwright ${name}`, () => {
    test(
      `send/receive notification without payload with ${name} (aesgcm)`,
      { timeout: PUSH_TEST_TIMEOUT },
      async () => {
        await runTest(type, {
          contentEncoding: webPush.supportedContentEncodings.AES_GCM,
        });
      },
    );

    test(
      `send/receive notification without payload with ${name} (aes128gcm)`,
      { timeout: PUSH_TEST_TIMEOUT },
      async () => {
        await runTest(type, {
          contentEncoding: webPush.supportedContentEncodings.AES_128_GCM,
        });
      },
    );

    test(
      `send/receive notification with payload with ${name} (aesgcm)`,
      { timeout: PUSH_TEST_TIMEOUT },
      async () => {
        await runTest(type, {
          payload: "marco",
          contentEncoding: webPush.supportedContentEncodings.AES_GCM,
        });
      },
    );

    test(
      `send/receive notification with payload with ${name} (aes128gcm)`,
      { timeout: PUSH_TEST_TIMEOUT },
      async () => {
        await runTest(type, {
          payload: "marco",
          contentEncoding: webPush.supportedContentEncodings.AES_128_GCM,
        });
      },
    );

    test(
      `send/receive notification with vapid with ${name} (aesgcm)`,
      { timeout: PUSH_TEST_TIMEOUT },
      async () => {
        await runTest(type, {
          vapid: VAPID_PARAM,
          contentEncoding: webPush.supportedContentEncodings.AES_GCM,
        });
      },
    );

    test(
      `send/receive notification with vapid with ${name} (aes128gcm)`,
      { timeout: PUSH_TEST_TIMEOUT },
      async () => {
        await runTest(type, {
          vapid: VAPID_PARAM,
          contentEncoding: webPush.supportedContentEncodings.AES_128_GCM,
        });
      },
    );

    test(
      `send/receive notification with payload & vapid with ${name} (aesgcm)`,
      { timeout: PUSH_TEST_TIMEOUT },
      async () => {
        await runTest(type, {
          payload: "marco",
          vapid: VAPID_PARAM,
          contentEncoding: webPush.supportedContentEncodings.AES_GCM,
        });
      },
    );

    test(
      `send/receive notification with payload & vapid with ${name} (aes128gcm)`,
      { timeout: PUSH_TEST_TIMEOUT },
      async () => {
        await runTest(type, {
          payload: "marco",
          vapid: VAPID_PARAM,
          contentEncoding: webPush.supportedContentEncodings.AES_128_GCM,
        });
      },
    );
  });
}
