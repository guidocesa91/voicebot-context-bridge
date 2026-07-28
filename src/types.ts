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

export interface PanelData {
  caller_number: string;
  conversation_id: string;
  summary: string;
  intent: string;
  fields: Record<string, unknown>;
  created_at: string;
}
