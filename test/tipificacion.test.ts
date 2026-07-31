import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify from "fastify";

const store = new Map<string, string>();

vi.mock("../src/store/redis.js", () => ({
  redis: { quit: vi.fn() },
  getContext: vi.fn(async (e164: string) => {
    const raw = store.get(`ctx:${e164}`);
    return raw ? JSON.parse(raw) : null;
  }),
}));

const insertLlamada = vi.fn();
vi.mock("../src/store/sqlite.js", () => ({
  insertLlamada,
}));

vi.mock("../src/config.js", () => ({
  config: {
    panelTokenSecret: "test-secret-at-least-32-bytes-long!!",
    panelTokenTtlSeconds: 1800,
    supervisorTokenSecret: "another-test-secret-32-bytes-long!!",
    supervisorTokenTtlSeconds: 28800,
  },
}));

const { tipificacionRoutes } = await import("../src/routes/tipificacion.js");
const { signPanelToken } = await import("../src/lib/tokens.js");

const app = Fastify();
beforeAll(async () => {
  await app.register(tipificacionRoutes);
  await app.ready();

  store.set(
    "ctx:+5491155554820",
    JSON.stringify({
      caller_number: "+5491155554820",
      conversation_id: "conv_abc123",
      summary: "Quiere pedir turno de cardiologia",
      intent: "solicitud_turno",
      fields: {},
      created_at: "2026-07-28T12:00:00.000Z",
    }),
  );
});
afterAll(() => app.close());

describe("POST /api/panel/tipificar", () => {
  it("returns 400 with invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/panel/tipificar",
      payload: { token: "x" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/panel/tipificar",
      payload: { token: "garbage", tipo: "no_turno", subtipo: "precio" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("guarda la tipificacion completando resumen/intent desde el contexto en redis", async () => {
    const token = await signPanelToken({
      phone: "+5491155554820",
      conversation_id: "conv_abc123",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/panel/tipificar",
      payload: {
        token,
        tipo: "turno",
        subtipo: "consultorio_especialidad",
        particular: false,
        reprogramado: false,
        cantidad_turnos: 2,
        especialidad: "Cardiología",
        observacion: "Prefiere la manana",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(insertLlamada).toHaveBeenCalledWith(
      expect.objectContaining({
        caller_number: "+5491155554820",
        conversation_id: "conv_abc123",
        summary: "Quiere pedir turno de cardiologia",
        intent: "solicitud_turno",
        tipo: "turno",
        subtipo: "consultorio_especialidad",
        cantidad_turnos: 2,
        especialidad: "Cardiología",
        observacion: "Prefiere la manana",
      }),
    );
  });

  it("guarda igual aunque no haya contexto vigente en redis", async () => {
    const token = await signPanelToken({
      phone: "+5491100000000",
      conversation_id: "conv_sin_contexto",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/panel/tipificar",
      payload: { token, tipo: "no_turno", subtipo: "precio" },
    });
    expect(res.statusCode).toBe(200);
    expect(insertLlamada).toHaveBeenCalledWith(
      expect.objectContaining({
        caller_number: "+5491100000000",
        summary: null,
        intent: null,
        tipo: "no_turno",
        subtipo: "precio",
      }),
    );
  });

  it("permite tipo=cancelado sin subtipo", async () => {
    const token = await signPanelToken({
      phone: "+5491155554820",
      conversation_id: "conv_abc123",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/panel/tipificar",
      payload: { token, tipo: "cancelado" },
    });
    expect(res.statusCode).toBe(200);
    expect(insertLlamada).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "cancelado", subtipo: undefined }),
    );
  });

  it("rejects tipo fuera de la taxonomia cerrada", async () => {
    const token = await signPanelToken({
      phone: "+5491155554820",
      conversation_id: "conv_abc123",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/panel/tipificar",
      payload: { token, tipo: "cualquier_cosa" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects subtipo que no corresponde al tipo (no_turno con subtipo de turno)", async () => {
    const token = await signPanelToken({
      phone: "+5491155554820",
      conversation_id: "conv_abc123",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/panel/tipificar",
      payload: { token, tipo: "no_turno", subtipo: "reso" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects tipo=turno sin subtipo", async () => {
    const token = await signPanelToken({
      phone: "+5491155554820",
      conversation_id: "conv_abc123",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/panel/tipificar",
      payload: { token, tipo: "turno" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects observacion mas larga que 140 caracteres", async () => {
    const token = await signPanelToken({
      phone: "+5491155554820",
      conversation_id: "conv_abc123",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/panel/tipificar",
      payload: {
        token,
        tipo: "no_turno",
        subtipo: "precio",
        observacion: "x".repeat(141),
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
