import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify from "fastify";
import { contextRoutes } from "../src/routes/context.js";

// Mock Redis
vi.mock("../src/store/redis.js", () => {
  const store = new Map<string, string>();
  return {
    redis: { quit: vi.fn() },
    saveContext: vi.fn(async (e164: string, ctx: unknown) => {
      store.set(`ctx:${e164}`, JSON.stringify(ctx));
    }),
    getContext: vi.fn(async (e164: string) => {
      const raw = store.get(`ctx:${e164}`);
      return raw ? JSON.parse(raw) : null;
    }),
  };
});

// Mock config
vi.mock("../src/config.js", () => ({
  config: {
    ingestApiKey: "test-key",
    contextTtlSeconds: 900,
  },
}));

const app = Fastify();
beforeAll(async () => {
  await app.register(contextRoutes);
  await app.ready();
});
afterAll(() => app.close());

const validBody = {
  caller_number: "+5491155554820",
  conversation_id: "conv_abc123",
  summary: "Quiere cambiar la direccion de entrega",
  intent: "cambio_direccion_entrega",
  fields: { pedido: "48213", verificado: true },
};

describe("POST /api/context", () => {
  it("returns 401 without auth header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/context",
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 with wrong API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/context",
      headers: { authorization: "Bearer wrong-key" },
      payload: validBody,
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 400 with invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/context",
      headers: { authorization: "Bearer test-key" },
      payload: { caller_number: "+5491155554820" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid payload");
  });

  it("returns 400 with invalid phone number", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/context",
      headers: { authorization: "Bearer test-key" },
      payload: { ...validBody, caller_number: "not-a-number" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid phone number");
  });

  it("returns 204 on success", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/context",
      headers: { authorization: "Bearer test-key" },
      payload: validBody,
    });
    expect(res.statusCode).toBe(204);
  });

  it("normalizes phone number before saving", async () => {
    const { saveContext } = await import("../src/store/redis.js");
    const res = await app.inject({
      method: "POST",
      url: "/api/context",
      headers: { authorization: "Bearer test-key" },
      payload: { ...validBody, caller_number: "+54 9 11 5555-4820" },
    });
    expect(res.statusCode).toBe(204);
    expect(saveContext).toHaveBeenCalledWith(
      "+5491155554820",
      expect.objectContaining({ caller_number: "+5491155554820" }),
    );
  });
});
