import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Normaliza un número de teléfono a formato E.164.
 * Retorna el número normalizado o null si no es válido.
 */
export function normalizeE164(raw: string): string | null {
  const phone = parsePhoneNumberFromString(raw);
  if (!phone || !phone.isValid()) return null;
  return phone.number; // E.164: "+5491155554820"
}

/**
 * Genera la clave Redis para un número E.164.
 */
export function contextKey(e164: string): string {
  return `ctx:${e164}`;
}
