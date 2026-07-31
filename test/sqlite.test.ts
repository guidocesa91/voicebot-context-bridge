import { describe, it, expect, beforeAll } from "vitest";
import { vi } from "vitest";

vi.mock("../src/config.js", () => ({
  config: {
    sqlitePath: ":memory:",
    callRetentionDays: 90,
  },
}));

const { insertLlamada, deleteOlderThan, exportRange } = await import(
  "../src/store/sqlite.js"
);

function record(overrides: Partial<Parameters<typeof insertLlamada>[0]> = {}) {
  return {
    caller_number: "+5491155554820",
    conversation_id: "conv_1",
    summary: "Resumen de prueba",
    intent: "solicitud_turno",
    tipo: "turno" as const,
    subtipo: "consultorio_especialidad" as const,
    particular: false,
    reprogramado: false,
    cantidad_turnos: 2,
    especialidad: "Cardiología",
    observacion: "Prefiere turno mañana",
    created_at: "2026-07-15T10:00:00.000Z",
    ...overrides,
  };
}

beforeAll(() => {
  // Limpio cualquier fila que pudiera haber quedado de otra suite compartiendo el modulo.
  deleteOlderThan(-36500);
});

describe("insertLlamada / exportRange", () => {
  it("guarda una fila y la devuelve dentro del rango", () => {
    insertLlamada(record());
    const rows = exportRange(
      "2026-07-01T00:00:00.000Z",
      "2026-07-31T23:59:59.999Z",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      caller_number: "+5491155554820",
      tipo: "turno",
      subtipo: "consultorio_especialidad",
      particular: false,
      reprogramado: false,
      cantidad_turnos: 2,
      especialidad: "Cardiología",
      observacion: "Prefiere turno mañana",
    });
  });

  it("no devuelve filas fuera del rango pedido", () => {
    const rows = exportRange(
      "2026-01-01T00:00:00.000Z",
      "2026-01-31T23:59:59.999Z",
    );
    expect(rows).toHaveLength(0);
  });

  it("guarda tipificaciones sin campos de turno como null", () => {
    insertLlamada(
      record({
        conversation_id: "conv_2",
        tipo: "no_turno",
        subtipo: "precio",
        particular: undefined,
        reprogramado: undefined,
        cantidad_turnos: undefined,
        especialidad: undefined,
        observacion: undefined,
        created_at: "2026-07-16T10:00:00.000Z",
      }),
    );
    const rows = exportRange(
      "2026-07-16T00:00:00.000Z",
      "2026-07-16T23:59:59.999Z",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cantidad_turnos).toBeNull();
    expect(rows[0].especialidad).toBeNull();
    expect(rows[0].particular).toBe(false);
    expect(rows[0].reprogramado).toBe(false);
  });
});

describe("deleteOlderThan", () => {
  it("borra solo las filas mas viejas que N dias y devuelve cuantas borro", () => {
    insertLlamada(
      record({
        conversation_id: "conv_old",
        created_at: new Date(Date.now() - 100 * 86_400_000).toISOString(),
      }),
    );
    insertLlamada(
      record({
        conversation_id: "conv_recent",
        created_at: new Date().toISOString(),
      }),
    );

    const deleted = deleteOlderThan(90);
    expect(deleted).toBeGreaterThanOrEqual(1);

    const remaining = exportRange(
      "1970-01-01T00:00:00.000Z",
      "2999-01-01T00:00:00.000Z",
    );
    expect(
      remaining.some((r) => r.conversation_id === "conv_old"),
    ).toBe(false);
    expect(
      remaining.some((r) => r.conversation_id === "conv_recent"),
    ).toBe(true);
  });
});
