import WebPushError from "./WebPushError.ts";
import * as vapidHelper from "./vapid-helper.ts";
import * as encryptionHelper from "./encryption-helper.ts";
import * as webPushConstants from "./web-push-constants.ts";
import * as urlBase64Helper from "./urlsafe-base64-helper.ts";

export interface PushSubscription {
  endpoint: string;
  keys?: {
    p256dh: string;
    auth: string;
  };
}

export interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

type ContentEncoding = (typeof webPushConstants.supportedContentEncodings)[keyof typeof webPushConstants.supportedContentEncodings];
type Urgency = (typeof webPushConstants.supportedUrgency)[keyof typeof webPushConstants.supportedUrgency];

export interface RequestOptions {
  headers?: Record<string, string>;
  gcmAPIKey?: string;
  vapidDetails?: VapidDetails | null;
  TTL?: number;
  contentEncoding?: ContentEncoding;
  urgency?: Urgency;
  topic?: string;
  dispatcher?: unknown;
  signal?: AbortSignal;
}

export interface RequestDetails {
  method: string;
  headers: Record<string, string | number>;
  body: Buffer | null;
  endpoint: string;
  dispatcher?: unknown;
  signal?: AbortSignal;
}

export interface SendResult {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

// Default TTL is four weeks.
const DEFAULT_TTL = 2419200;

let gcmAPIKey: string | null = "";
let vapidDetails: VapidDetails | null | undefined;

export default class WebPushLib {
  setGCMAPIKey(apiKey: string | null): void {
    if (apiKey === null) {
      gcmAPIKey = null;
      return;
    }

    if (typeof apiKey === "undefined" || typeof apiKey !== "string" || apiKey.length === 0) {
      throw new Error("The GCM API Key should be a non-empty string or null.");
    }

    gcmAPIKey = apiKey;
  }

  setVapidDetails(subject: string | null, publicKey?: string, privateKey?: string): void {
    if (arguments.length === 1 && arguments[0] === null) {
      vapidDetails = null;
      return;
    }

    vapidHelper.validateSubject(subject as string);
    vapidHelper.validatePublicKey(publicKey as string);
    vapidHelper.validatePrivateKey(privateKey as string);

    vapidDetails = {
      subject: subject as string,
      publicKey: publicKey as string,
      privateKey: privateKey as string,
    };
  }

  generateRequestDetails(subscription: PushSubscription, payload?: string | Buffer | null, options?: RequestOptions): RequestDetails {
    if (!subscription || !subscription.endpoint) {
      throw new Error("You must pass in a subscription with at least " + "an endpoint.");
    }

    if (typeof subscription.endpoint !== "string" || subscription.endpoint.length === 0) {
      throw new Error("The subscription endpoint must be a string with " + "a valid URL.");
    }

    if (payload) {
      // Validate the subscription keys
      if (
        typeof subscription !== "object" ||
        !subscription.keys ||
        !subscription.keys.p256dh ||
        !subscription.keys.auth
      ) {
        throw new Error(
          "To send a message with a payload, the " +
            "subscription must have 'auth' and 'p256dh' keys.",
        );
      }
    }

    let currentGCMAPIKey = gcmAPIKey;
    let currentVapidDetails = vapidDetails;
    let timeToLive: number | undefined = DEFAULT_TTL;
    let extraHeaders: Record<string, string> = {};
    let contentEncoding: ContentEncoding = webPushConstants.supportedContentEncodings.AES_128_GCM;
    let urgency: Urgency = webPushConstants.supportedUrgency.NORMAL;
    let topic: string | undefined;
    let dispatcher: unknown;
    let signal: AbortSignal | undefined;

    if (options) {
      const validOptionKeys = [
        "headers",
        "gcmAPIKey",
        "vapidDetails",
        "TTL",
        "contentEncoding",
        "urgency",
        "topic",
        "dispatcher",
        "signal",
      ];
      const optionKeys = Object.keys(options);
      for (let i = 0; i < optionKeys.length; i += 1) {
        const optionKey = optionKeys[i];
        if (!validOptionKeys.includes(optionKey)) {
          throw new Error(
            "'" +
              optionKey +
              "' is an invalid option. " +
              "The valid options are ['" +
              validOptionKeys.join("', '") +
              "'].",
          );
        }
      }

      if (options.headers) {
        extraHeaders = options.headers;
        let duplicates = Object.keys(extraHeaders).filter(header => {
          return typeof (options as Record<string, unknown>)[header] !== "undefined";
        });

        if (duplicates.length > 0) {
          throw new Error(
            "Duplicated headers defined [" +
              duplicates.join(",") +
              "]. Please either define the header in the" +
              "top level options OR in the 'headers' key.",
          );
        }
      }

      if (options.gcmAPIKey) {
        currentGCMAPIKey = options.gcmAPIKey;
      }

      // Falsy values are allowed here so one can skip Vapid `else if` below and use FCM
      if (options.vapidDetails !== undefined) {
        currentVapidDetails = options.vapidDetails;
      }

      if (options.TTL !== undefined) {
        timeToLive = Number(options.TTL);
        if (timeToLive! < 0) {
          throw new Error("TTL should be a number and should be at least 0");
        }
      }

      if (options.contentEncoding) {
        if (
          options.contentEncoding === webPushConstants.supportedContentEncodings.AES_128_GCM ||
          options.contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM
        ) {
          contentEncoding = options.contentEncoding;
        } else {
          throw new Error("Unsupported content encoding specified.");
        }
      }

      if (options.urgency) {
        if (
          options.urgency === webPushConstants.supportedUrgency.VERY_LOW ||
          options.urgency === webPushConstants.supportedUrgency.LOW ||
          options.urgency === webPushConstants.supportedUrgency.NORMAL ||
          options.urgency === webPushConstants.supportedUrgency.HIGH
        ) {
          urgency = options.urgency;
        } else {
          throw new Error("Unsupported urgency specified.");
        }
      }

      if (options.topic) {
        if (!urlBase64Helper.validate(options.topic)) {
          throw new Error(
            "Unsupported characters set use the URL or filename-safe Base64 characters set",
          );
        }
        if (options.topic.length > 32) {
          throw new Error(
            "use maximum of 32 characters from the URL or filename-safe Base64 characters set",
          );
        }
        topic = options.topic;
      }

      if (options.dispatcher) {
        dispatcher = options.dispatcher;
      }

      if (options.signal) {
        signal = options.signal;
      }
    }

    if (typeof timeToLive === "undefined") {
      timeToLive = DEFAULT_TTL;
    }

    const requestDetails: RequestDetails = {
      method: "POST",
      headers: {
        TTL: timeToLive,
      },
      body: null,
      endpoint: subscription.endpoint,
    };
    Object.keys(extraHeaders).forEach(header => {
      requestDetails.headers[header] = extraHeaders[header];
    });
    let requestPayload: Buffer | null = null;

    if (payload) {
      const encrypted = encryptionHelper.encrypt(
        subscription.keys!.p256dh,
        subscription.keys!.auth,
        payload,
        contentEncoding,
      );

      requestDetails.headers["Content-Length"] = encrypted.cipherText.length;
      requestDetails.headers["Content-Type"] = "application/octet-stream";

      if (contentEncoding === webPushConstants.supportedContentEncodings.AES_128_GCM) {
        requestDetails.headers["Content-Encoding"] =
          webPushConstants.supportedContentEncodings.AES_128_GCM;
      } else if (contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM) {
        requestDetails.headers["Content-Encoding"] =
          webPushConstants.supportedContentEncodings.AES_GCM;
        requestDetails.headers.Encryption = "salt=" + encrypted.salt;
        requestDetails.headers["Crypto-Key"] =
          "dh=" + encrypted.localPublicKey.toString("base64url");
      }

      requestPayload = encrypted.cipherText;
    } else {
      requestDetails.headers["Content-Length"] = 0;
    }

    const isGCM = subscription.endpoint.startsWith("https://android.googleapis.com/gcm/send");
    const isFCM = subscription.endpoint.startsWith("https://fcm.googleapis.com/fcm/send");
    // VAPID isn't supported by GCM hence the if, else if.
    if (isGCM) {
      if (!currentGCMAPIKey) {
        console.warn(
          "Attempt to send push notification to GCM endpoint, " +
            "but no GCM key is defined. Please use setGCMApiKey() or add " +
            "'gcmAPIKey' as an option.",
        );
      } else {
        requestDetails.headers.Authorization = "key=" + currentGCMAPIKey;
      }
    } else if (currentVapidDetails) {
      const parsedUrl = new URL(subscription.endpoint);
      const audience = parsedUrl.origin;

      const vapidHeaders = vapidHelper.getVapidHeaders(
        audience,
        currentVapidDetails.subject,
        currentVapidDetails.publicKey,
        currentVapidDetails.privateKey,
        contentEncoding,
      );

      requestDetails.headers.Authorization = vapidHeaders.Authorization;

      if (contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM) {
        if (requestDetails.headers["Crypto-Key"]) {
          requestDetails.headers["Crypto-Key"] += ";" + vapidHeaders["Crypto-Key"];
        } else {
          requestDetails.headers["Crypto-Key"] = vapidHeaders["Crypto-Key"];
        }
      }
    } else if (isFCM && currentGCMAPIKey) {
      requestDetails.headers.Authorization = "key=" + currentGCMAPIKey;
    }

    requestDetails.headers.Urgency = urgency;

    if (topic) {
      requestDetails.headers.Topic = topic;
    }

    requestDetails.body = requestPayload;

    if (dispatcher) {
      requestDetails.dispatcher = dispatcher;
    }

    if (signal) {
      requestDetails.signal = signal;
    }

    return requestDetails;
  }

  async sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: RequestOptions,
  ): Promise<SendResult> {
    const requestDetails = this.generateRequestDetails(subscription, payload, options);

    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      method: requestDetails.method,
      headers: requestDetails.headers as Record<string, string>,
    };

    if (requestDetails.body) {
      fetchOptions.body = new Uint8Array(requestDetails.body);
    }

    if (requestDetails.signal) {
      fetchOptions.signal = requestDetails.signal;
    }

    if (requestDetails.dispatcher) {
      fetchOptions.dispatcher = requestDetails.dispatcher;
    }

    const response = await fetch(requestDetails.endpoint, fetchOptions);
    const responseText = await response.text();

    if (response.status < 200 || response.status > 299) {
      throw new WebPushError(
        "Received unexpected response code",
        response.status,
        Object.fromEntries(response.headers.entries()),
        responseText,
        requestDetails.endpoint,
      );
    }

    return {
      statusCode: response.status,
      body: responseText,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }
}
