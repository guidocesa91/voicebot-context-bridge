import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import { verifyPanelToken } from "../lib/tokens.js";
import { getContext } from "../store/redis.js";
import { insertLlamada } from "../store/sqlite.js";

const SUBTIPOS_TURNO = [
  "reso",
  "tomo",
  "eco_doppler",
  "eeg",
  "emg",
  "consultorio_especialidad",
  "chequeo_cmi_apto",
  "unr",
  "cognitiva",
  "hospital_dia_cognitiva",
  "hospital_dia_psiquiatrico",
  "gedyt",
  "psoriahue",
] as const;

const SUBTIPOS_NO_TURNO = [
  "precio",
  "cobertura",
  "prestacion",
  "sin_agenda",
  "whatsapp",
  "info_imagenes",
  "info_consultorios_externos",
  "info_4to_piso",
  "orden_vencida",
  "email_supervision",
  "fecha_turno",
  "call_cortada",
  "no_portal",
  "receta_orden_resultado",
  "lab_rx_demanda",
] as const;

const tipificacionBodySchema = z
  .object({
    token: z.string().min(1),
    tipo: z.enum(["turno", "no_turno", "cancelado"]),
    subtipo: z.enum([...SUBTIPOS_TURNO, ...SUBTIPOS_NO_TURNO]).optional(),
    particular: z.boolean().optional(),
    reprogramado: z.boolean().optional(),
    cantidad_turnos: z.number().int().min(1).max(20).optional(),
    especialidad: z.string().trim().min(1).max(80).optional(),
    observacion: z.string().trim().max(140).optional(),
  })
  .refine(
    (b) =>
      b.tipo !== "turno" || SUBTIPOS_TURNO.includes(b.subtipo as never),
    { message: "subtipo invalido para tipo=turno", path: ["subtipo"] },
  )
  .refine(
    (b) =>
      b.tipo !== "no_turno" ||
      SUBTIPOS_NO_TURNO.includes(b.subtipo as never),
    { message: "subtipo invalido para tipo=no_turno", path: ["subtipo"] },
  );

export async function tipificacionRoutes(app: FastifyInstance) {
  app.post("/api/panel/tipificar", async (request, reply) => {
    const parsed = tipificacionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid payload",
        details: parsed.error.issues,
      });
    }

    const {
      token,
      tipo,
      subtipo,
      particular,
      reprogramado,
      cantidad_turnos,
      especialidad,
      observacion,
    } = parsed.data;

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
      subtipo,
      particular,
      reprogramado,
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
