export interface ContextPayload {
  caller_number: string;
  conversation_id: string;
  summary: string;
  intent: string;
  fields: Record<string, unknown>;
}

export interface StoredContext extends ContextPayload {
  created_at: string;
}

export interface CrmContact {
  id: string;
  first_name: string;
  phone: string;
  contact_url: string;
}

export interface CrmSearchResponse {
  data: CrmContact[];
}

/** Una interacción previa del mismo número, para el historial del panel. */
export interface HistoryEntry {
  conversation_id: string;
  summary: string;
  intent: string;
  fields: Record<string, unknown>;
  created_at: string;
}

/** Categoria principal de la tipificacion. Refleja las columnas TURNO/NO TURNO/CANCELADO de la planilla actual. */
export type TipoLlamada = "turno" | "no_turno" | "cancelado";

/** Subtipos validos cuando tipo = "turno" (tipo de estudio/servicio agendado). */
export type SubtipoTurno =
  | "reso"
  | "tomo"
  | "eco_doppler"
  | "eeg"
  | "emg"
  | "consultorio_especialidad"
  | "chequeo_cmi_apto"
  | "unr"
  | "cognitiva"
  | "hospital_dia_cognitiva"
  | "hospital_dia_psiquiatrico"
  | "gedyt"
  | "psoriahue";

/** Subtipos validos cuando tipo = "no_turno" (motivo por el que no se agendo). */
export type SubtipoNoTurno =
  | "precio"
  | "cobertura"
  | "prestacion"
  | "sin_agenda"
  | "whatsapp"
  | "info_imagenes"
  | "info_consultorios_externos"
  | "info_4to_piso"
  | "orden_vencida"
  | "email_supervision"
  | "fecha_turno"
  | "call_cortada"
  | "no_portal"
  | "receta_orden_resultado"
  | "lab_rx_demanda";

/** Body que manda el panel al tipificar una llamada. */
export interface TipificacionInput {
  tipo: TipoLlamada;
  subtipo?: SubtipoTurno | SubtipoNoTurno;
  /** Paciente sin obra social (equivale a los subtipos "PARTICULAR X" de la planilla). Solo aplica con tipo = "turno". */
  particular?: boolean;
  /** La llamada fue para reprogramar un turno ya agendado, no para pedir uno nuevo. Solo aplica con tipo = "turno". */
  reprogramado?: boolean;
  cantidad_turnos?: number;
  especialidad?: string;
  observacion?: string;
}

/** Registro durable de una llamada ya tipificada (tabla `llamadas` en SQLite). */
export interface LlamadaRecord extends TipificacionInput {
  id?: number;
  caller_number: string;
  conversation_id: string | null;
  summary: string | null;
  intent: string | null;
  created_at: string;
}

export interface PanelData {
  caller_number: string;
  conversation_id: string;
  summary: string;
  intent: string;
  fields: Record<string, unknown>;
  created_at: string;
  /** Interacciones anteriores, de la más reciente a la más vieja. Excluye la actual. */
  history: HistoryEntry[];
  /** Cantidad de interacciones en `history`. */
  history_count: number;
}
