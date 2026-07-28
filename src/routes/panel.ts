import type { FastifyInstance } from "fastify";
import { verifyPanelToken } from "../lib/tokens.js";
import { getContext } from "../store/redis.js";
import type { PanelData } from "../types.js";

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

    const context = await getContext(claims.phone);
    if (!context) {
      const empty: PanelData = {
        caller_number: claims.phone,
        conversation_id: claims.conversation_id,
        summary: "",
        intent: "",
        fields: {},
        created_at: "",
      };
      return reply.send(empty);
    }

    const data: PanelData = {
      caller_number: context.caller_number,
      conversation_id: context.conversation_id,
      summary: context.summary,
      intent: context.intent,
      fields: context.fields,
      created_at: context.created_at,
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
    if(!d.summary){
      app.innerHTML=\`<div class="empty">
        <h2>Sin contexto previo</h2>
        <p>No hay información del voicebot para esta llamada.</p>
        <p style="margin-top:8px">Número: \${esc(d.caller_number)}</p>
      </div>\`;
      return;
    }
    const fields=d.fields&&Object.keys(d.fields).length
      ? Object.entries(d.fields).map(([k,v])=>
          '<span class="field-key">'+esc(k)+'</span><span class="field-val">'+esc(String(v))+'</span>'
        ).join("")
      : '<span class="field-val" style="grid-column:span 2">—</span>';
    const ts=d.created_at?new Date(d.created_at).toLocaleString("es-AR"):"—";
    app.innerHTML=\`
      <div class="header">
        <div>
          <div class="phone">\${esc(d.caller_number)}</div>
          <div class="conv-id">\${esc(d.conversation_id)}</div>
        </div>
      </div>
      <div class="card"><h2>Intención</h2><span class="intent">\${esc(d.intent)}</span></div>
      <div class="card"><h2>Resumen</h2><p>\${esc(d.summary)}</p></div>
      <div class="card"><h2>Datos capturados</h2><div class="field-grid">\${fields}</div></div>
      <div class="meta">Contexto creado: \${ts}</div>
    \`;
  }catch(e){
    loading.style.display="none";
    app.style.display="block";
    app.innerHTML='<div class="error"><h2>Error de conexión</h2></div>';
  }
})();
function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}
</script>
</body>
</html>`;
}
