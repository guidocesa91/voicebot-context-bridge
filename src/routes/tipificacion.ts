import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import { verifyPanelToken } from "../lib/tokens.js";
import { getContext } from "../store/redis.js";
import { insertLlamada } from "../store/sqlite.js";

const tipificacionBodySchema = z.object({
  token: z.string().min(1),
  tipo: z.enum([
    "turno",
    "consulta_general",
    "reclamo",
    "desvio_area",
    "otro",
  ]),
  cantidad_turnos: z.number().int().min(1).max(20).optional(),
  especialidad: z.string().trim().min(1).max(80).optional(),
  observacion: z.string().trim().max(140).optional(),
});

export async function tipificacionRoutes(app: FastifyInstance) {
  app.post("/api/panel/tipificar", async (request, reply) => {
    const parsed = tipificacionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid payload",
        details: parsed.error.issues,
      });
    }

    const { token, tipo, cantidad_turnos, especialidad, observacion } =
      parsed.data;

    const claims = await verifyPanelToken(token);
    if (!claims) {
      return reply.code(401).send({ error: "Invalid or expired token" });
    }

    const context = await getContext(claims.phone);

    insertLlamada({
      caller_number: claims.phone,
      conversation_id: context?.conversation_id ?? claims.conversation_id,
      summary: context?.summary ?? null,
      intent: context?.intent ?? null,
      tipo,
      cantidad_turnos,
      especialidad,
      observacion,
      created_at: new Date().toISOString(),
    });

    request.log.info(
      { phone: claims.phone, tipo },
      "Llamada tipificada",
    );

    return reply.code(200).send({ status: "ok" });
  });
}
