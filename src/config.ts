import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT ?? "8080", 10),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8080",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  contextTtlSeconds: parseInt(process.env.CONTEXT_TTL_SECONDS ?? "900", 10),
  // Historial de interacciones previas (independiente del contexto en curso)
  historyTtlSeconds: parseInt(
    process.env.HISTORY_TTL_SECONDS ?? "7776000", // 90 dias
    10,
  ),
  historyMaxItems: parseInt(process.env.HISTORY_MAX_ITEMS ?? "10", 10),
  ingestApiKey: process.env.INGEST_API_KEY ?? "",
  crmApiKey: process.env.CRM_API_KEY ?? "",
  panelTokenSecret: process.env.PANEL_TOKEN_SECRET ?? "",
  panelTokenTtlSeconds: parseInt(
    process.env.PANEL_TOKEN_TTL_SECONDS ?? "1800",
    10,
  ),
  logLevel: process.env.LOG_LEVEL ?? "info",

  // Registro durable de llamadas (tipificacion), separado de Redis.
  sqlitePath: process.env.SQLITE_PATH ?? "./data/llamadas.db",
  callRetentionDays: parseInt(process.env.CALL_RETENTION_DAYS ?? "90", 10),

  // Login del supervisor (una sola cuenta).
  supervisorUsername: process.env.SUPERVISOR_USERNAME ?? "",
  supervisorPasswordHash: process.env.SUPERVISOR_PASSWORD_HASH ?? "",
  supervisorTokenSecret: process.env.SUPERVISOR_TOKEN_SECRET ?? "",
  supervisorTokenTtlSeconds: parseInt(
    process.env.SUPERVISOR_TOKEN_TTL_SECONDS ?? "28800",
    10,
  ),
} as const;
