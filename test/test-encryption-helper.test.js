import * as assert from "node:assert";
import * as crypto from "node:crypto";
import { describe, test } from "node:test";

import * as ece from "http_ece";

import * as webPush from "../src/index.ts";

const userCurve = crypto.createECDH("prime256v1");
const VALID_PUBLIC_KEY = userCurve.generateKeys().toString("base64url");
const VALID_AUTH = crypto.randomBytes(16).toString("base64url");

describe("Test Encryption Helpers", () => {
  test("is defined", () => {
    assert(webPush.encrypt);
  });

  function encryptDecrypt(thing, contentEncoding) {
    const encrypted = webPush.encrypt(VALID_PUBLIC_KEY, VALID_AUTH, thing, contentEncoding);

    return ece.decrypt(encrypted.cipherText, {
      version: contentEncoding,
      dh: encrypted.localPublicKey.toString("base64url"),
      privateKey: userCurve,
      salt: encrypted.salt,
      authSecret: VALID_AUTH,
    });
  }

  test("encrypt/decrypt string (aesgcm)", () => {
    assert(
      encryptDecrypt("hello", webPush.supportedContentEncodings.AES_GCM).equals(
        Buffer.from("hello"),
      ),
    );
  });

  test("encrypt/decrypt string (aes128gcm)", () => {
    assert(
      encryptDecrypt("hello", webPush.supportedContentEncodings.AES_128_GCM).equals(
        Buffer.from("hello"),
      ),
    );
  });

  test("encrypt/decrypt buffer (aesgcm)", () => {
    assert(
      encryptDecrypt(Buffer.from("hello"), webPush.supportedContentEncodings.AES_GCM).equals(
        Buffer.from("hello"),
      ),
    );
  });

  test("encrypt/decrypt buffer (aes128gcm)", () => {
    assert(
      encryptDecrypt(Buffer.from("hello"), webPush.supportedContentEncodings.AES_128_GCM).equals(
        Buffer.from("hello"),
      ),
    );
  });

  // userPublicKey, userAuth, payload
  const badInputs = [
    contentEncoding => {
      webPush.encrypt(null, null, null, contentEncoding);
    },
    contentEncoding => {
      // Invalid public key
      webPush.encrypt(null, VALID_AUTH, "Example", contentEncoding);
    },
    contentEncoding => {
      // Invalid auth
      webPush.encrypt(VALID_PUBLIC_KEY, null, "Example", contentEncoding);
    },
    contentEncoding => {
      // No payload
      webPush.encrypt(VALID_PUBLIC_KEY, VALID_AUTH, null, contentEncoding);
    },
    contentEncoding => {
      // Invalid auth size
      webPush.encrypt(VALID_PUBLIC_KEY, "Fake", "Example", contentEncoding);
    },
    contentEncoding => {
      // Invalid auth size
      webPush.encrypt(VALID_PUBLIC_KEY, VALID_AUTH, [], contentEncoding);
    },
  ];

  function testBadInput(contentEncoding) {
    badInputs.forEach((badInput, index) => {
      assert.throws(() => {
        badInput(contentEncoding);
        console.log("Encryption input failed to throw: " + index);
      });
    });
  }

  test("bad input to encrypt (aesgcm)", () => {
    testBadInput(webPush.supportedContentEncodings.AES_GCM);
  });

  test("bad input to encrypt (aes128gcm)", () => {
    testBadInput(webPush.supportedContentEncodings.AES_128_GCM);
  });
});
