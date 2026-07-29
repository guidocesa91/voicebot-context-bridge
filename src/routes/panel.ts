import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { verifyPanelToken } from "../lib/tokens.js";
import { getContext, getHistory } from "../store/redis.js";
import type { HistoryEntry, PanelData, StoredContext } from "../types.js";

/**
 * Arma el historial visible: saca la interacción en curso (ya se muestra arriba)
 * y recorta a `historyMaxItems`.
 */
function buildHistory(
  all: StoredContext[],
  currentConversationId: string,
): HistoryEntry[] {
  return all
    .filter((c) => c.conversation_id !== currentConversationId)
    .slice(0, config.historyMaxItems)
    .map((c) => ({
      conversation_id: c.conversation_id,
      summary: c.summary,
      intent: c.intent,
      fields: c.fields,
      created_at: c.created_at,
    }));
}

export async function panelRoutes(app: FastifyInstance) {
  // JSON endpoint — consumed by the panel front-end
  app.get("/api/panel-data", async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) {
      return reply.code(400).send({ error: "Missing token" });
    }

    const claims = await verifyPanelToken(token);
    if (!claims) {
      return reply.code(401).send({ error: "Invalid or expired token" });
    }

    const [context, allHistory] = await Promise.all([
      getContext(claims.phone),
      getHistory(claims.phone),
    ]);

    // Sin contexto en curso el panel igual sirve: puede haber interacciones previas.
    if (!context) {
      const history = buildHistory(allHistory, claims.conversation_id);
      const empty: PanelData = {
        caller_number: claims.phone,
        conversation_id: claims.conversation_id,
        summary: "",
        intent: "",
        fields: {},
        created_at: "",
        history,
        history_count: history.length,
      };
      return reply.send(empty);
    }

    const history = buildHistory(allHistory, context.conversation_id);
    const data: PanelData = {
      caller_number: context.caller_number,
      conversation_id: context.conversation_id,
      summary: context.summary,
      intent: context.intent,
      fields: context.fields,
      created_at: context.created_at,
      history,
      history_count: history.length,
    };

    return reply.send(data);
  });

  // HTML panel — opened inside Linkus iframe via contact_url
  app.get("/panel", async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) {
      return reply.code(400).type("text/html").send("<h1>Token requerido</h1>");
    }

    const claims = await verifyPanelToken(token);
    if (!claims) {
      return reply
        .code(401)
        .type("text/html")
        .send("<h1>Token inválido o expirado</h1>");
    }

    return reply.type("text/html").send(panelHtml(token));
  });
}

function panelHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contexto de llamada</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#f5f7fa;color:#1a1a2e;padding:16px;font-size:14px}
  .card{background:#fff;border-radius:8px;padding:20px;margin-bottom:12px;
    box-shadow:0 1px 3px rgba(0,0,0,.1)}
  .card h2{font-size:15px;color:#6c757d;margin-bottom:8px;text-transform:uppercase;
    letter-spacing:.5px}
  .card p,.card pre{font-size:14px;line-height:1.5}
  .intent{display:inline-block;background:#e8f4fd;color:#0277bd;padding:4px 12px;
    border-radius:12px;font-weight:600;font-size:13px}
  .field-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 12px}
  .field-key{font-weight:600;color:#495057}
  .field-val{color:#212529}
  .header{display:flex;align-items:center;gap:12px;margin-bottom:16px}
  .header .phone{font-size:18px;font-weight:700}
  .header .conv-id{font-size:12px;color:#adb5bd}
  .meta{font-size:12px;color:#adb5bd;text-align:right}
  .empty{text-align:center;padding:40px 20px;color:#6c757d}
  .empty h2{font-size:18px;margin-bottom:8px;color:#495057}
  .error{text-align:center;padding:40px 20px;color:#c62828}
  #loading{text-align:center;padding:40px;color:#6c757d}
  /* --- historial de interacciones previas --- */
  .hist-title{display:flex;align-items:center;gap:8px;margin:20px 0 10px;
    font-size:13px;color:#6c757d;text-transform:uppercase;letter-spacing:.5px}
  .badge{background:#0277bd;color:#fff;border-radius:10px;padding:1px 8px;
    font-size:12px;font-weight:700;letter-spacing:0}
  .hist-item{background:#fff;border-radius:8px;margin-bottom:8px;
    box-shadow:0 1px 3px rgba(0,0,0,.1);overflow:hidden}
  .hist-item summary{padding:12px 14px;cursor:pointer;list-style:none;
    display:flex;align-items:center;gap:10px;font-size:13px}
  .hist-item summary::-webkit-details-marker{display:none}
  .hist-item summary:hover{background:#f8f9fa}
  .hist-item summary::before{content:"\\25B8";color:#adb5bd;font-size:11px;
    transition:transform .15s;flex-shrink:0}
  .hist-item[open] summary::before{transform:rotate(90deg)}
  .hist-date{color:#6c757d;flex-shrink:0;font-variant-numeric:tabular-nums}
  .hist-intent{background:#eef1f4;color:#495057;padding:2px 8px;border-radius:10px;
    font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis;max-width:55%}
  .hist-body{padding:0 14px 14px;border-top:1px solid #eef1f4;margin-top:2px}
  .hist-body h3{font-size:11px;color:#adb5bd;text-transform:uppercase;
    letter-spacing:.5px;margin:12px 0 4px}
  .hist-body p{font-size:13px;line-height:1.5}
  .hist-conv{font-size:11px;color:#ced4da;margin-top:10px;word-break:break-all}
  .hist-none{color:#adb5bd;font-size:13px;padding:2px 0 8px}
</style>
</head>
<body>
<div id="loading">Cargando contexto…</div>
<div id="app" style="display:none"></div>
<script>
(async()=>{
  const app=document.getElementById("app");
  const loading=document.getElementById("loading");
  try{
    const r=await fetch("/api/panel-data?token=${token}");
    loading.style.display="none";
    app.style.display="block";
    if(!r.ok){
      app.innerHTML='<div class="error"><h2>Error</h2><p>'+r.status+'</p></div>';
      return;
    }
    const d=await r.json();
    const hist=Array.isArray(d.history)?d.history:[];
    const current=d.summary
      ? \`<div class="card"><h2>Intención</h2><span class="intent">\${esc(d.intent)}</span></div>
         <div class="card"><h2>Resumen</h2><p>\${esc(d.summary)}</p></div>
         <div class="card"><h2>Datos capturados</h2><div class="field-grid">\${fieldsHtml(d.fields)}</div></div>
         <div class="meta">Contexto creado: \${fmt(d.created_at)}</div>\`
      : \`<div class="card empty">
           <h2>Sin contexto previo</h2>
           <p>No hay información del voicebot para esta llamada.</p>
         </div>\`;
    app.innerHTML=\`
      <div class="header">
        <div>
          <div class="phone">\${esc(d.caller_number)}</div>
          <div class="conv-id">\${esc(d.conversation_id)}</div>
        </div>
      </div>
      \${current}
      <div class="hist-title">
        Interacciones previas <span class="badge">\${hist.length}</span>
      </div>
      \${hist.length?hist.map(histHtml).join(""):'<div class="hist-none">Es la primera vez que llama.</div>'}
    \`;
  }catch(e){
    loading.style.display="none";
    app.style.display="block";
    app.innerHTML='<div class="error"><h2>Error de conexión</h2></div>';
  }
})();
function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}
function fmt(iso){
  if(!iso)return "—";
  const dt=new Date(iso);
  return isNaN(dt)?"—":dt.toLocaleString("es-AR",
    {day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});
}
function fieldsHtml(f){
  if(!f||!Object.keys(f).length)
    return '<span class="field-val" style="grid-column:span 2">—</span>';
  return Object.entries(f).map(([k,v])=>
    '<span class="field-key">'+esc(k)+'</span>'+
    '<span class="field-val">'+esc(typeof v==="object"&&v!==null?JSON.stringify(v):String(v))+'</span>'
  ).join("");
}
function histHtml(h){
  return \`<details class="hist-item">
    <summary>
      <span class="hist-date">\${fmt(h.created_at)}</span>
      <span class="hist-intent">\${esc(h.intent||"sin intención")}</span>
    </summary>
    <div class="hist-body">
      <h3>Resumen</h3>
      <p>\${esc(h.summary||"—")}</p>
      <h3>Datos capturados</h3>
      <div class="field-grid">\${fieldsHtml(h.fields)}</div>
      <div class="hist-conv">\${esc(h.conversation_id||"")}</div>
    </div>
  </details>\`;
}
</script>
</body>
</html>`;
}
