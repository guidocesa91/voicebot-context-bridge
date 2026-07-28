import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT ?? "8080", 10),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8080",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  contextTtlSeconds: parseInt(process.env.CONTEXT_TTL_SECONDS ?? "900", 10),
  ingestApiKey: process.env.INGEST_API_KEY ?? "",
  crmApiKey: process.env.CRM_API_KEY ?? "",
  panelTokenSecret: process.env.PANEL_TOKEN_SECRET ?? "",
  panelTokenTtlSeconds: parseInt(
    process.env.PANEL_TOKEN_TTL_SECONDS ?? "1800",
    10,
  ),
  logLevel: process.env.LOG_LEVEL ?? "info",
} as const;
