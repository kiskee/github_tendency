import crypto from "crypto";
import { TOKEN_ENCRYPTION_KEY } from "../config/auth.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 64; // 32 bytes hex

function getKey(): Buffer {
  if (!TOKEN_ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY no definida en .env");
  }
  if (TOKEN_ENCRYPTION_KEY.length !== KEY_LENGTH) {
    throw new Error(`TOKEN_ENCRYPTION_KEY debe ser ${KEY_LENGTH} caracteres hex`);
  }
  return Buffer.from(TOKEN_ENCRYPTION_KEY, "hex");
}

export function encryptToken(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptToken(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }
  const [ivHex, authTagHex, encryptedData] = parts;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
