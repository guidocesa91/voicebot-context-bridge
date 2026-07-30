import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify from "fastify";
import { hashPassword } from "../src/lib/password.js";

const exportRange = vi.fn(() => [
  {
    id: 1,
    caller_number: "+5491155554820",
    conversation_id: "conv_abc123",
    summary: "Resumen de prueba",
    intent: "solicitud_turno",
    tipo: "turno" as const,
    cantidad_turnos: 2,
    especialidad: "Cardiología",
    observacion: "Prefiere la manana",
    created_at: "2026-07-15T10:00:00.000Z",
  },
]);
vi.mock("../src/store/sqlite.js", () => ({ exportRange }));

const PASSWORD_HASH = hashPassword("s3cret-pass");

vi.mock("../src/config.js", () => ({
  config: {
    supervisorUsername: "supervisor",
    supervisorPasswordHash: PASSWORD_HASH,
    supervisorTokenSecret: "supervisor-test-secret-32-bytes-long!!",
    supervisorTokenTtlSeconds: 28800,
    panelTokenSecret: "panel-test-secret-32-bytes-long!!",
    panelTokenTtlSeconds: 1800,
  },
}));

const { supervisorRoutes } = await import("../src/routes/supervisor.js");

const app = Fastify();
beforeAll(async () => {
  await app.register(supervisorRoutes);
  await app.ready();
});
afterAll(() => app.close());

describe("POST /supervisor/login", () => {
  it("returns 401 with wrong password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/supervisor/login",
      payload: { username: "supervisor", password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 with wrong username", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/supervisor/login",
      payload: { username: "otro", password: "s3cret-pass" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns a token with correct credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/supervisor/login",
      payload: { username: "supervisor", password: "s3cret-pass" },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe("string");
  });
});

describe("GET /supervisor/export", () => {
  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/supervisor/export?from=2026-07-01&to=2026-07-31",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 with invalid date params", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/supervisor/login",
      payload: { username: "supervisor", password: "s3cret-pass" },
    });
    const { token } = loginRes.json();
    const res = await app.inject({
      method: "GET",
      url: "/supervisor/export?from=not-a-date&to=2026-07-31",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns a CSV with the rows in range", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/supervisor/login",
      payload: { username: "supervisor", password: "s3cret-pass" },
    });
    const { token } = loginRes.json();
    const res = await app.inject({
      method: "GET",
      url: "/supervisor/export?from=2026-07-01&to=2026-07-31",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain(
      "llamadas_2026-07-01_2026-07-31.csv",
    );
    expect(res.body).toContain("+5491155554820");
    expect(res.body).toContain("Cardiología");
    expect(exportRange).toHaveBeenCalledWith(
      "2026-07-01T00:00:00.000Z",
      "2026-07-31T23:59:59.999Z",
    );
  });
});
