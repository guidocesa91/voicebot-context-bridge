import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import type { LlamadaRecord } from "../types.js";

if (config.sqlitePath !== ":memory:") {
  mkdirSync(dirname(config.sqlitePath), { recursive: true });
}

export const db = new DatabaseSync(config.sqlitePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS llamadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caller_number TEXT NOT NULL,
    conversation_id TEXT,
    summary TEXT,
    intent TEXT,
    tipo TEXT NOT NULL,
    subtipo TEXT,
    particular INTEGER,
    reprogramado INTEGER,
    cantidad_turnos INTEGER,
    especialidad TEXT,
    observacion TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_llamadas_created_at ON llamadas(created_at);
`);

// Migracion liviana: agrega columnas nuevas a bases creadas antes de que existiera
// el desglose tipo/subtipo (no hay libreria de migraciones en el proyecto).
const existingColumns = new Set(
  (db.prepare(`PRAGMA table_info(llamadas)`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  ),
);
for (const [column, ddl] of [
  ["subtipo", "ALTER TABLE llamadas ADD COLUMN subtipo TEXT"],
  ["particular", "ALTER TABLE llamadas ADD COLUMN particular INTEGER"],
  ["reprogramado", "ALTER TABLE llamadas ADD COLUMN reprogramado INTEGER"],
] as const) {
  if (!existingColumns.has(column)) db.exec(ddl);
}

export function insertLlamada(record: LlamadaRecord): void {
  db.prepare(
    `INSERT INTO llamadas
      (caller_number, conversation_id, summary, intent, tipo, subtipo, particular, reprogramado, cantidad_turnos, especialidad, observacion, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.caller_number,
    record.conversation_id,
    record.summary,
    record.intent,
    record.tipo,
    record.subtipo ?? null,
    record.particular ? 1 : 0,
    record.reprogramado ? 1 : 0,
    record.cantidad_turnos ?? null,
    record.especialidad ?? null,
    record.observacion ?? null,
    record.created_at,
  );
}

export function deleteOlderThan(days: number): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const result = db
    .prepare(`DELETE FROM llamadas WHERE created_at < ?`)
    .run(cutoff);
  return Number(result.changes);
}

export function exportRange(fromISO: string, toISO: string): LlamadaRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM llamadas WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC`,
    )
    .all(fromISO, toISO) as unknown as Array<
    Omit<LlamadaRecord, "particular" | "reprogramado"> & {
      particular: number | null;
      reprogramado: number | null;
    }
  >;
  return rows.map((r) => ({
    ...r,
    particular: !!r.particular,
    reprogramado: !!r.reprogramado,
  }));
}
