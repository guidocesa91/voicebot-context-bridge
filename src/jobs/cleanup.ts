import type { FastifyBaseLogger } from "fastify";
import { config } from "../config.js";
import { deleteOlderThan } from "../store/sqlite.js";

const ONE_DAY_MS = 86_400_000;

export function runCleanup(logger: FastifyBaseLogger): void {
  const deleted = deleteOlderThan(config.callRetentionDays);
  if (deleted > 0) {
    logger.info(
      { deleted, retentionDays: config.callRetentionDays },
      "Limpieza de llamadas viejas",
    );
  }
}

export function startCleanupJob(logger: FastifyBaseLogger): void {
  runCleanup(logger);
  setInterval(() => runCleanup(logger), ONE_DAY_MS).unref();
}
