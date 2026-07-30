import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { contextRoutes } from "./routes/context.js";
import { crmRoutes } from "./routes/crm.js";
import { panelRoutes } from "./routes/panel.js";
import { tipificacionRoutes } from "./routes/tipificacion.js";
import { supervisorRoutes } from "./routes/supervisor.js";
import { startCleanupJob } from "./jobs/cleanup.js";

const app = Fastify({
  logger: {
    level: config.logLevel,
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

await app.register(cors);
await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});
await app.register(healthRoutes);
await app.register(contextRoutes);
await app.register(crmRoutes);
await app.register(panelRoutes);
await app.register(tipificacionRoutes);
await app.register(supervisorRoutes);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  startCleanupJob(app.log);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
