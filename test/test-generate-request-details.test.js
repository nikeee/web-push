import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as crypto from "node:crypto";

import * as jws from "jws";

import webPushModule from "../src/index.ts";
import { generateVAPIDKeys } from "../src/vapid-helper.ts";

const lib = new webPushModule.WebPushLib();
const generateRequestDetails = lib.generateRequestDetails.bind(lib);

describe("Test Generate Request Details", () => {
  test("is defined", () => {
    assert(generateRequestDetails);
  });

  const userCurve = crypto.createECDH("prime256v1");
  const userPublicKey = userCurve.generateKeys();
  const userAuth = crypto.randomBytes(16);
  const vapidKeys = generateVAPIDKeys();

  const VALID_KEYS = {
    p256dh: userPublicKey.toString("base64url"),
    auth: userAuth.toString("base64url"),
  };

  const invalidRequests = [
    {
      testTitle: "0 arguments",
      requestOptions: {},
    },
    {
      testTitle: "No Endpoint",
      requestOptions: {
        subscription: {},
      },
    },
    {
      testTitle: "Empty Endpoint",
      requestOptions: {
        subscription: {
          endpoint: "",
        },
      },
    },
    {
      testTitle: "Array for Endpoint",
      requestOptions: {
        subscription: {
          endpoint: [],
        },
      },
    },
    {
      testTitle: "Object for Endpoint",
      requestOptions: {
        subscription: {
          endpoint: {},
        },
      },
    },
    {
      testTitle: "Object for Endpoint",
      requestOptions: {
        subscription: {
          endpoint: true,
        },
      },
    },
    {
      testTitle: "Payload provided with no keys",
      requestOptions: {
        subscription: {
          endpoint: true,
        },
        message: "hello",
      },
    },
    {
      testTitle: "Payload provided with invalid keys",
      requestOptions: {
        subscription: {
          endpoint: true,
          keys: "silly example",
        },
        message: "hello",
      },
    },
    {
      testTitle: "Payload provided with only p256dh keys",
      requestOptions: {
        subscription: {
          endpoint: true,
          keys: {
            p256dh: userPublicKey.toString("base64url"),
          },
        },
        message: "hello",
      },
    },
    {
      testTitle: "Payload provided with only auth keys",
      requestOptions: {
        subscription: {
          endpoint: true,
          keys: {
            auth: userAuth.toString("base64url"),
          },
        },
        message: "hello",
      },
    },
    {
      testTitle: "userPublicKey argument isn't a string",
      requestOptions: {
        subscription: {
          keys: {
            p256dh: userPublicKey,
            auth: userAuth.toString("base64url"),
          },
        },
        message: "hello",
      },
      addEndpoint: true,
    },
    {
      testTitle: "userAuth argument isn't a string",
      requestOptions: {
        subscription: {
          keys: {
            p256dh: userPublicKey.toString("base64url"),
            auth: userAuth,
          },
        },
        message: "hello",
      },
      addEndpoint: true,
    },
    {
      testTitle: "userPublicKey argument is too long",
      requestOptions: {
        subscription: {
          keys: {
            p256dh: Buffer.concat([userPublicKey, Buffer.alloc(1)]).toString("base64url"),
            auth: userAuth.toString("base64url"),
          },
        },
        message: "hello",
      },
      addEndpoint: true,
    },
    {
      testTitle: "userPublicKey argument is too short",
      requestOptions: {
        subscription: {
          keys: {
            p256dh: userPublicKey.slice(1).toString("base64url"),
            auth: userAuth.toString("base64url"),
          },
        },
        message: "hello",
      },
      addEndpoint: true,
    },
    {
      testTitle: "userAuth argument is too short",
      requestOptions: {
        subscription: {
          keys: {
            p256dh: userPublicKey.toString("base64url"),
            auth: userAuth.slice(1).toString("base64url"),
          },
        },
        message: "hello",
      },
      addEndpoint: true,
    },
    {
      testTitle: "rejects when payload isn't a string or buffer",
      requestOptions: {
        subscription: {
          keys: VALID_KEYS,
        },
        message: [],
      },
      addEndpoint: true,
      serverFlags: ["statusCode=404"],
    },
    {
      testTitle: "send notification with invalid vapid option",
      requestOptions: {
        subscription: {
          keys: VALID_KEYS,
        },
        message: "hello",
        addEndpoint: true,
        extraOptions: {
          vapid: {
            subject: "mailto:mozilla@example.org",
            privateKey: vapidKeys.privateKey,
            publicKey: vapidKeys.publicKey,
          },
        },
      },
    },
    {
      testTitle: "duplicated headers",
      requestOptions: {
        subscription: {
          keys: VALID_KEYS,
        },
        message: "hello",
        addEndpoint: true,
        extraOptions: {
          TTL: 100,
          headers: {
            TTL: 900,
          },
        },
      },
    },
  ];

  invalidRequests.forEach(invalidRequest => {
    test(invalidRequest.testTitle, () => {
      if (invalidRequest.addEndpoint) {
        invalidRequest.requestOptions.subscription.endpoint = "https://127.0.0.1:8080";
      }

      if (invalidRequest.serverFlags) {
        invalidRequest.requestOptions.subscription.endpoint +=
          "?" + invalidRequest.serverFlags.join("&");
      }

      assert.throws(() => {
        return generateRequestDetails(
          invalidRequest.requestOptions.subscription,
          invalidRequest.requestOptions.message,
          invalidRequest.requestOptions.extraOptions,
        );
      });
    });
  });

  test("Extra headers", () => {
    let subscription = { endpoint: "https://127.0.0.1:8080" };
    let message;
    let extraOptions = {
      TTL: 100,
      headers: {
        Topic: "topic",
        Urgency: "normal",
      },
    };
    let details = generateRequestDetails(subscription, message, extraOptions);
    assert.equal(details.headers.TTL, extraOptions.TTL);
    assert.equal(details.headers.Topic, extraOptions.headers.Topic);
    assert.equal(details.headers.Urgency, extraOptions.headers.Urgency);
  });

  test("Audience contains port with aes128gcm", () => {
    const subscription = {
      endpoint: "http://example.com:4242/life-universe-and-everything",
    };

    const extraOptions = {
      vapidDetails: {
        subject: "mailto:example@example.com",
        publicKey: vapidKeys.publicKey,
        privateKey: vapidKeys.privateKey,
      },
    };

    const requestDetails = generateRequestDetails(subscription, null, extraOptions);
    const authHeader = requestDetails.headers.Authorization;

    // Get the Encoded JWT Token from the Authorization Header
    // and decoded it using `jws.decode`
    // to get the value of audience in jwt payload
    const jwtContents = authHeader.match(/vapid\st=([^,]*)/)[1];
    const decodedContents = jws.decode(jwtContents);
    const audience = decodedContents.payload.aud;

    assert.ok(audience, "Audience exists");
    assert.equal(audience, "http://example.com:4242", "Audience contains expected value with port");
  });

  test("Audience contains port with aesgcm", () => {
    const subscription = {
      endpoint: "http://example.com:4242/life-universe-and-everything",
    };

    const extraOptions = {
      vapidDetails: {
        subject: "mailto:example@example.com",
        publicKey: vapidKeys.publicKey,
        privateKey: vapidKeys.privateKey,
      },
      contentEncoding: "aesgcm",
    };

    const requestDetails = generateRequestDetails(subscription, null, extraOptions);
    const authHeader = requestDetails.headers.Authorization;

    // Get the Encoded JWT Token from the Authorization Header
    // and decoded it using `jws.decode`
    // to get the value of audience in jwt payload
    const jwtContents = authHeader.match(/WebPush\s(.*)/)[1];
    const decodedContents = jws.decode(jwtContents);
    const audience = decodedContents.payload.aud;

    assert.ok(audience, "Audience exists");
    assert.equal(audience, "http://example.com:4242", "Audience contains expected value with port");
  });

  test("Dispatcher option", () => {
    let subscription = {
      endpoint: "https://127.0.0.1:8080",
    };
    let extraOptions = {
      dispatcher: { custom: true },
    };
    let details = generateRequestDetails(subscription, null, extraOptions);
    assert.equal(details.dispatcher, extraOptions.dispatcher);
  });

  test("Signal option", () => {
    let subscription = {
      endpoint: "https://127.0.0.1:8080",
    };
    const signal = AbortSignal.timeout(5000);
    let extraOptions = {
      signal,
    };
    let details = generateRequestDetails(subscription, null, extraOptions);
    assert.equal(details.signal, signal);
  });
});
