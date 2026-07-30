import { SignJWT, jwtVerify, errors } from "jose";
import { config } from "../config.js";

const secret = new TextEncoder().encode(config.panelTokenSecret);
const supervisorSecret = new TextEncoder().encode(
  config.supervisorTokenSecret,
);
const ALG = "HS256";

export interface PanelTokenPayload {
  phone: string;
  conversation_id: string;
}

export async function signPanelToken(
  payload: PanelTokenPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${config.panelTokenTtlSeconds}s`)
    .sign(secret);
}

export async function verifyPanelToken(
  token: string,
): Promise<PanelTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALG],
    });
    if (
      typeof payload.phone !== "string" ||
      typeof payload.conversation_id !== "string"
    ) {
      return null;
    }
    return {
      phone: payload.phone,
      conversation_id: payload.conversation_id,
    };
  } catch (err) {
    if (err instanceof errors.JWTExpired) return null;
    if (err instanceof errors.JWSSignatureVerificationFailed) return null;
    if (err instanceof errors.JWSInvalid) return null;
    throw err;
  }
}

export interface SupervisorTokenPayload {
  sub: string;
}

export async function signSupervisorToken(
  payload: SupervisorTokenPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${config.supervisorTokenTtlSeconds}s`)
    .sign(supervisorSecret);
}

export async function verifySupervisorToken(
  token: string,
): Promise<SupervisorTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, supervisorSecret, {
      algorithms: [ALG],
    });
    if (typeof payload.sub !== "string") return null;
    return { sub: payload.sub };
  } catch (err) {
    if (err instanceof errors.JWTExpired) return null;
    if (err instanceof errors.JWSSignatureVerificationFailed) return null;
    if (err instanceof errors.JWSInvalid) return null;
    throw err;
  }
}
