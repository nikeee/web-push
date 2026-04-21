import * as assert from "node:assert";
import * as fs from "node:fs";
import { describe, test, beforeEach, afterEach } from "node:test";

import * as seleniumAssistant from "selenium-assistant";
import * as webdriver from "selenium-webdriver";
import * as seleniumFirefox from "selenium-webdriver/firefox";

import * as webPush from "../src/index.js";
import createServer from "./helpers/create-server.js";

// We need geckodriver on the path
import "geckodriver";
import "chromedriver";

const vapidKeys = webPush.generateVAPIDKeys();

const PUSH_TEST_TIMEOUT = 120 * 1000;
const VAPID_PARAM = {
  subject: "mailto:web-push@mozilla.org",
  privateKey: vapidKeys.privateKey,
  publicKey: vapidKeys.publicKey,
};
const testDirectory = "./test/output/";

webPush.setGCMAPIKey("AIzaSyAwmdX6KKd4hPfIcGU2SOfj9vuRDW6u-wo");

let globalServer;
let globalDriver;
let testServerURL;

function runTest(browser, options) {
  options = options || {};

  if (process.env.CI) {
    return Promise.resolve();
  }

  return createServer(options, webPush)
    .then(function (server) {
      globalServer = server;
      testServerURL = "http://127.0.0.1:" + server.port;

      if (browser.getId() === "firefox") {
        // This is based off of: https://bugzilla.mozilla.org/show_bug.cgi?id=1275521
        // Unfortunately it doesn't seem to work :(
        const ffProfile = new seleniumFirefox.Profile();
        ffProfile.setPreference("dom.push.testing.ignorePermission", true);
        ffProfile.setPreference("notification.prompt.testing", true);
        ffProfile.setPreference("notification.prompt.testing.allow", true);
        browser.getSeleniumOptions().setProfile(ffProfile);
      } else if (browser.getId() === "chrome") {
        const chromeOperaPreferences = {
          profile: {
            content_settings: {
              exceptions: {
                notifications: {},
              },
            },
          },
        };
        chromeOperaPreferences.profile.content_settings.exceptions.notifications[
          testServerURL + ",*"
        ] = {
          setting: 1,
        };
        /* eslint-enable camelcase */

        // Write to a file
        const tempPreferenceDir = "./test/output/temp/chromeOperaPreferences";
        fs.mkdirSync(tempPreferenceDir + "/Default", { recursive: true });

        // NOTE: The Default part of this path might be Chrome specific.
        fs.writeFileSync(
          tempPreferenceDir + "/Default/Preferences",
          JSON.stringify(chromeOperaPreferences),
        );

        const seleniumOptions = browser.getSeleniumOptions();
        seleniumOptions.addArguments("user-data-dir=" + tempPreferenceDir + "/");
      }

      return browser.getSeleniumDriver();
    })
    .then(function (driver) {
      globalDriver = driver;

      if (options.vapid) {
        testServerURL += "?vapid=" + options.vapid.publicKey;
      }

      return globalDriver
        .get(testServerURL)
        .then(function () {
          return globalDriver.executeScript(function () {
            return typeof navigator.serviceWorker !== "undefined";
          });
        })
        .then(function (serviceWorkerSupported) {
          assert(serviceWorkerSupported);
        })
        .then(function () {
          return globalDriver.wait(function () {
            return globalDriver.executeScript(function () {
              return typeof window.subscribeSuccess !== "undefined";
            });
          });
        })
        .then(function () {
          return globalDriver.executeScript(function () {
            if (!window.subscribeSuccess) {
              return window.subscribeError;
            }

            return null;
          });
        })
        .then(function (subscribeError) {
          if (subscribeError) {
            console.log("subscribeError: ", subscribeError);
            throw subscribeError;
          }

          return globalDriver.executeScript(function () {
            return window.testSubscription;
          });
        })
        .then(function (subscription) {
          if (!subscription) {
            throw new Error("No subscription found.");
          }

          subscription = JSON.parse(subscription);

          let promise;
          let pushPayload = null;
          let vapid = null;
          let contentEncoding = null;
          if (options) {
            pushPayload = options.payload;
            vapid = options.vapid;
            contentEncoding = options.contentEncoding;
          }

          if (!pushPayload) {
            promise = webPush.sendNotification(subscription, null, {
              vapidDetails: vapid,
              contentEncoding: contentEncoding,
            });
          } else {
            if (!subscription.keys) {
              throw new Error("Require subscription.keys not found.");
            }

            promise = webPush.sendNotification(subscription, pushPayload, {
              vapidDetails: vapid,
              contentEncoding: contentEncoding,
            });
          }

          return promise.then(function (response) {
            if (response.length > 0) {
              const data = JSON.parse(response);
              if (typeof data.failure !== "undefined" && data.failure > 0) {
                throw new Error("Bad GCM Response: " + response);
              }
            }
          });
        })
        .then(function () {
          const expectedTitle = options.payload ? options.payload : "no payload";
          return globalDriver.wait(function () {
            return webdriver.until.titleIs(expectedTitle, 60000);
          });
        });
    });
}

seleniumAssistant.printAvailableBrowserInfo();

const availableBrowsers = seleniumAssistant.getLocalBrowsers();
availableBrowsers.forEach(function (browser) {
  if (browser.getId() !== "chrome" && browser.getId() !== "firefox") {
    return;
  }

  describe("Selenium " + browser.getPrettyName(), function () {
    beforeEach(function () {
      globalServer = null;

      return fs.promises.rm(testDirectory, { recursive: true, force: true });
    });

    afterEach(function () {
      return seleniumAssistant
        .killWebDriver(globalDriver)
        .catch(function (err) {
          console.log("Error killing web driver: ", err);
        })
        .then(function () {
          globalDriver = null;

          return fs.promises
            .rm(testDirectory, { recursive: true, force: true })
            .catch(function () {
              console.warn(
                "Unable to delete test directory, going to wait 2 " + "seconds and try again",
              );
              // Add a timeout so that if the browser
              // changes any files in the test directory
              // it doesn't cause fs.promises.rm to throw an error
              // (i.e. rm checks files in directory, deletes them
              // while another process adds a file, then rm fails
              // to remove a non-empty directory).
              return new Promise(function (resolve) {
                setTimeout(resolve, 2000);
              });
            })
            .then(function () {
              return fs.promises.rm(testDirectory, { recursive: true, force: true });
            });
        })
        .then(function () {
          if (globalServer) {
            globalServer.close();
            globalServer = null;
          }
        });
    });

    test(
      "send/receive notification without payload with " + browser.getPrettyName() + " (aesgcm)",
      { timeout: PUSH_TEST_TIMEOUT },
      function () {
        return runTest(browser, {
          contentEncoding: webPush.supportedContentEncodings.AES_GCM,
        });
      },
    );

    test(
      "send/receive notification without payload with " + browser.getPrettyName() + " (aes128gcm)",
      { timeout: PUSH_TEST_TIMEOUT },
      function () {
        return runTest(browser, {
          contentEncoding: webPush.supportedContentEncodings.AES_128_GCM,
        });
      },
    );

    test(
      "send/receive notification with payload with " + browser.getPrettyName() + " (aesgcm)",
      { timeout: PUSH_TEST_TIMEOUT },
      function () {
        return runTest(browser, {
          payload: "marco",
          contentEncoding: webPush.supportedContentEncodings.AES_GCM,
        });
      },
    );

    test(
      "send/receive notification with payload with " + browser.getPrettyName() + " (aes128gcm)",
      { timeout: PUSH_TEST_TIMEOUT },
      function () {
        return runTest(browser, {
          payload: "marco",
          contentEncoding: webPush.supportedContentEncodings.AES_128_GCM,
        });
      },
    );

    test(
      "send/receive notification with vapid with " + browser.getPrettyName() + " (aesgcm)",
      { timeout: PUSH_TEST_TIMEOUT },
      function () {
        return runTest(browser, {
          vapid: VAPID_PARAM,
          contentEncoding: webPush.supportedContentEncodings.AES_GCM,
        });
      },
    );

    test(
      "send/receive notification with vapid with " + browser.getPrettyName() + " (aes128gcm)",
      { timeout: PUSH_TEST_TIMEOUT },
      function () {
        return runTest(browser, {
          vapid: VAPID_PARAM,
          contentEncoding: webPush.supportedContentEncodings.AES_128_GCM,
        });
      },
    );

    test(
      "send/receive notification with payload & vapid with " +
        browser.getPrettyName() +
        " (aesgcm)",
      { timeout: PUSH_TEST_TIMEOUT },
      function () {
        return runTest(browser, {
          payload: "marco",
          vapid: VAPID_PARAM,
          contentEncoding: webPush.supportedContentEncodings.AES_GCM,
        });
      },
    );

    test(
      "send/receive notification with payload & vapid with " +
        browser.getPrettyName() +
        " (aes128gcm)",
      { timeout: PUSH_TEST_TIMEOUT },
      function () {
        return runTest(browser, {
          payload: "marco",
          vapid: VAPID_PARAM,
          contentEncoding: webPush.supportedContentEncodings.AES_128_GCM,
        });
      },
    );
  });
});
