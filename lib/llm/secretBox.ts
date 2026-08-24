import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class WritingConfigurationError extends Error { constructor() { super("Writing provider encryption is not configured"); } }
function key(): Buffer {
  const value = process.env.WRITING_CONFIG_ENCRYPTION_KEY;
  if (!value) throw new WritingConfigurationError();
  return Buffer.from(value).length === 32 ? Buffer.from(value) : Buffer.from(value, "base64");
}
export function encryptProviderSecret(plaintext: string): string {
  const encryptionKey = key(); if (encryptionKey.length !== 32) throw new WritingConfigurationError();
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
export function decryptProviderSecret(payload: string): string {
  const [iv, tag, ciphertext] = payload.split("."); if (!iv || !tag || !ciphertext) throw new WritingConfigurationError();
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
