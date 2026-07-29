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
