import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify from "fastify";

const store = new Map<string, string>();

vi.mock("../src/store/redis.js", () => ({
  redis: { quit: vi.fn() },
  saveContext: vi.fn(async (e164: string, ctx: unknown) => {
    store.set(`ctx:${e164}`, JSON.stringify(ctx));
  }),
  getContext: vi.fn(async (e164: string) => {
    const raw = store.get(`ctx:${e164}`);
    return raw ? JSON.parse(raw) : null;
  }),
}));

vi.mock("../src/config.js", () => ({
  config: {
    panelTokenSecret: "test-secret-at-least-32-bytes-long!!",
    panelTokenTtlSeconds: 1800,
    contextTtlSeconds: 900,
  },
}));

const { panelRoutes } = await import("../src/routes/panel.js");
const { signPanelToken } = await import("../src/lib/tokens.js");
const { saveContext } = await import("../src/store/redis.js");

const app = Fastify();
beforeAll(async () => {
  await app.register(panelRoutes);
  await app.ready();

  await saveContext("+5491155554820", {
    caller_number: "+5491155554820",
    conversation_id: "conv_abc123",
    summary: "Quiere cambiar direccion",
    intent: "cambio_direccion",
    fields: { pedido: "48213" },
    created_at: "2026-07-28T12:00:00.000Z",
  });
});
afterAll(() => app.close());

describe("GET /api/panel-data", () => {
  it("returns 400 without token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/panel-data" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/panel-data?token=garbage",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns context for valid token", async () => {
    const token = await signPanelToken({
      phone: "+5491155554820",
      conversation_id: "conv_abc123",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/panel-data?token=${token}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.caller_number).toBe("+5491155554820");
    expect(body.conversation_id).toBe("conv_abc123");
    expect(body.summary).toBe("Quiere cambiar direccion");
    expect(body.intent).toBe("cambio_direccion");
    expect(body.fields).toEqual({ pedido: "48213" });
    expect(body.created_at).toBe("2026-07-28T12:00:00.000Z");
  });

  it("returns empty context when no data in redis", async () => {
    const token = await signPanelToken({
      phone: "+14155551234",
      conversation_id: "conv_unknown",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/panel-data?token=${token}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.caller_number).toBe("+14155551234");
    expect(body.summary).toBe("");
    expect(body.intent).toBe("");
  });
});

describe("GET /panel", () => {
  it("returns 400 without token", async () => {
    const res = await app.inject({ method: "GET", url: "/panel" });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/panel?token=garbage",
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("returns HTML page for valid token", async () => {
    const token = await signPanelToken({
      phone: "+5491155554820",
      conversation_id: "conv_abc123",
    });
    const res = await app.inject({
      method: "GET",
      url: `/panel?token=${token}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("<!DOCTYPE html>");
    expect(res.body).toContain("Contexto de llamada");
    expect(res.body).toContain("/api/panel-data");
  });
});
