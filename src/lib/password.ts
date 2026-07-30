import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

/** Genera un hash `salt:hash` (ambos hex) listo para pegar en SUPERVISOR_PASSWORD_HASH. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, KEY_LENGTH);
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
