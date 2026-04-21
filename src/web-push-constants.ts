export const supportedContentEncodings = {
  AES_GCM: "aesgcm",
  AES_128_GCM: "aes128gcm",
} as const;

export const supportedUrgency = {
  VERY_LOW: "very-low",
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
} as const;
