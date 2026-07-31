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
  /* Paleta clinica sobria: fondo frio, tinta azul-grisacea, un unico acento teal.
     Sin fuentes externas a proposito: el panel se abre mientras suena el telefono
     y no puede depender de una descarga. */
  :root{
    --bg:#eef2f6; --surface:#fff; --ink:#0f1f2b; --muted:#5b6b7c;
    --faint:#93a3b3; --line:#dfe6ed; --accent:#0e7490; --accent-soft:#e0f2f4;
    --sans:"Segoe UI",system-ui,-apple-system,sans-serif;
    --mono:ui-monospace,"Cascadia Mono",Consolas,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);font-size:14px;color:var(--ink);
    background:var(--bg);
    background-image:radial-gradient(120% 60% at 50% 0,#fff 0,transparent 70%);
    padding:20px 16px 32px;-webkit-font-smoothing:antialiased}
  #loading{max-width:620px;margin:0 auto}
  #app{max-width:1080px;margin:0 auto}

  /* Dos columnas: contexto+historial a la izquierda, tipificacion a la
     derecha, siempre a mano sin tener que bajar. En ventanas angostas
     colapsa a una sola columna apilada. */
  .layout{display:grid;grid-template-columns:1fr 360px;gap:0 28px;align-items:start}
  .col-right{position:sticky;top:20px}
  @media (max-width:860px){
    .layout{display:block}
    .col-right{position:static;margin-top:26px}
  }

  /* Encabezado: el numero es el dato que se busca de un vistazo. */
  .header{padding-bottom:14px;margin-bottom:18px;
    border-bottom:2px solid var(--accent)}
  .header .phone{font-family:var(--mono);font-size:23px;font-weight:600;
    letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .header .conv-id{font-family:var(--mono);font-size:11px;color:var(--faint);
    margin-top:3px;word-break:break-all}

  .card{background:var(--surface);border:1px solid var(--line);border-radius:10px;
    padding:16px 18px;margin-bottom:10px;
    box-shadow:0 1px 2px rgba(15,31,43,.04)}
  .card h2{font-size:10.5px;font-weight:700;color:var(--faint);margin-bottom:9px;
    text-transform:uppercase;letter-spacing:.09em}
  /* El resumen es lo unico que la recepcionista lee entero: mas grande y aireado. */
  .card p{font-size:15px;line-height:1.62;color:#1c2c39}

  .intent{display:inline-block;background:var(--accent-soft);color:var(--accent);
    padding:5px 13px;border-radius:999px;font-weight:600;font-size:13px;
    box-shadow:inset 0 0 0 1px rgba(14,116,144,.16)}

  .field-grid{display:grid;grid-template-columns:auto 1fr;gap:0 16px;
    font-size:13.5px}
  .field-grid>span{padding:7px 0;border-top:1px solid var(--line)}
  .field-grid>span:nth-child(1),.field-grid>span:nth-child(2){border-top:0;padding-top:0}
  .field-key{color:var(--muted);text-transform:uppercase;font-size:10.5px;
    font-weight:700;letter-spacing:.07em;padding-top:9px;white-space:nowrap}
  .field-val{color:var(--ink)}

  .meta{font-size:11.5px;color:var(--faint);text-align:right;padding:2px 2px 0}
  .empty{text-align:center;padding:34px 20px}
  .empty h2{font-size:15px;color:var(--muted);letter-spacing:.04em;margin-bottom:7px}
  .empty p{font-size:13.5px;color:var(--faint)}
  .error{text-align:center;padding:44px 20px;color:#b3261e;font-weight:600}
  #loading{text-align:center;padding:52px;color:var(--faint);
    animation:pulse 1.4s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.45}}

  /* --- historial de interacciones previas --- */
  .hist-title{display:flex;align-items:center;gap:9px;margin:26px 0 10px;
    font-size:10.5px;font-weight:700;color:var(--muted);
    text-transform:uppercase;letter-spacing:.09em}
  .hist-title::after{content:"";flex:1;height:1px;background:var(--line)}
  .badge{background:var(--accent);color:#fff;border-radius:999px;padding:2px 9px;
    font-size:11.5px;font-weight:700;letter-spacing:0;
    font-variant-numeric:tabular-nums}
  .hist-item{background:var(--surface);border:1px solid var(--line);
    border-radius:10px;margin-bottom:7px;overflow:hidden;
    transition:border-color .15s,box-shadow .15s}
  .hist-item[open]{border-color:#c3d4de;box-shadow:0 2px 8px rgba(15,31,43,.06)}
  .hist-item summary{padding:12px 15px;cursor:pointer;list-style:none;
    display:flex;align-items:center;gap:11px;font-size:13px;
    transition:background .12s}
  .hist-item summary::-webkit-details-marker{display:none}
  .hist-item summary:hover{background:#f6f9fb}
  .hist-item summary::before{content:"";flex-shrink:0;width:6px;height:6px;
    border-right:1.5px solid var(--faint);border-bottom:1.5px solid var(--faint);
    transform:rotate(-45deg);transition:transform .18s ease}
  .hist-item[open] summary::before{transform:rotate(45deg);
    border-color:var(--accent)}
  .hist-date{color:var(--muted);flex-shrink:0;font-family:var(--mono);
    font-size:12px;font-variant-numeric:tabular-nums}
  .hist-intent{background:#eef2f6;color:var(--muted);padding:3px 9px;
    border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis;max-width:55%}
  .hist-body{padding:2px 15px 15px 32px;border-top:1px solid var(--line)}
  .hist-body h3{font-size:10px;color:var(--faint);text-transform:uppercase;
    letter-spacing:.09em;font-weight:700;margin:13px 0 5px}
  .hist-body p{font-size:13.5px;line-height:1.6}
  .hist-conv{font-family:var(--mono);font-size:10.5px;color:#b8c5d0;
    margin-top:12px;word-break:break-all}
  .hist-none{color:var(--faint);font-size:13.5px;padding:4px 0 8px}

  /* --- tipificacion --- */
  .tip-row{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
  .tip-row label{font-size:10.5px;font-weight:700;color:var(--muted);
    text-transform:uppercase;letter-spacing:.07em}
  .tip-row select,.tip-row input{font:inherit;font-size:13.5px;color:var(--ink);
    background:var(--bg);border:1px solid var(--line);border-radius:8px;
    padding:9px 11px;width:100%}
  .tip-row select:focus,.tip-row input:focus{outline:2px solid var(--accent-soft);
    border-color:var(--accent)}
  .tip-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .tip-check{display:flex;align-items:center;gap:7px;font-size:12.5px;
    color:var(--muted);cursor:pointer}
  .tip-check input{width:auto}
  .tip-save{width:100%;background:var(--accent);color:#fff;border:none;
    border-radius:9px;padding:12px;font:inherit;font-size:14px;font-weight:700;
    cursor:pointer;transition:opacity .15s}
  .tip-save:hover{opacity:.92}
  .tip-save:disabled{opacity:.55;cursor:default}
  .tip-msg{font-size:12.5px;text-align:center;margin-top:9px;min-height:16px}
  .tip-msg.error{color:#b3261e}
  .tip-msg.ok{color:var(--accent)}

  /* Entrada escalonada: da la sensacion de que el panel "llego", no que parpadeo. */
  .col-left>*{animation:rise .32s ease-out backwards}
  .col-left>*:nth-child(2){animation-delay:.04s}
  .col-left>*:nth-child(3){animation-delay:.08s}
  .col-left>*:nth-child(n+4){animation-delay:.12s}
  .col-right{animation:rise .32s ease-out backwards;animation-delay:.06s}
  @keyframes rise{from{opacity:0;transform:translateY(6px)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;
    transition:none!important}}
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
      <div class="layout">
        <div class="col-left">
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
        </div>
        <div class="col-right">
          <div class="card tip-card">
            <h2>Tipificar llamada</h2>
            <div class="tip-row">
              <label for="tipTipo">Tipo</label>
              <select id="tipTipo">
                <option value="turno">Turno</option>
                <option value="no_turno">No turno</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div id="tipSubtipoRow" class="tip-row">
              <label for="tipSubtipo">Subtipo</label>
              <select id="tipSubtipo"></select>
            </div>
            <div id="tipTurnoFlags" class="tip-two">
              <label class="tip-check"><input type="checkbox" id="tipParticular"> Particular</label>
              <label class="tip-check"><input type="checkbox" id="tipReprogramado"> Reprogramado</label>
            </div>
            <div id="tipTurnoFields" class="tip-two">
              <div class="tip-row">
                <label for="tipCantidad">Cantidad de turnos</label>
                <input id="tipCantidad" type="number" min="1" max="20" value="1">
              </div>
              <div class="tip-row">
                <label for="tipEspecialidad">Especialidad</label>
                <input id="tipEspecialidad" type="text" maxlength="80" placeholder="ej. Cardiología">
              </div>
            </div>
            <div class="tip-row">
              <label for="tipObs">Observación (opcional, breve)</label>
              <input id="tipObs" type="text" maxlength="140" placeholder="máx. 140 caracteres">
            </div>
            <button id="tipGuardar" class="tip-save" type="button">Guardar y cerrar</button>
            <div id="tipMsg" class="tip-msg"></div>
          </div>
        </div>
      </div>
    \`;
    wireTipificacion("${token}");
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
const SUBTIPOS_TURNO=[
  ["reso","RESO"],["tomo","TOMO"],["eco_doppler","ECO/Doppler"],["eeg","EEG"],
  ["emg","EMG"],["consultorio_especialidad","Consultorio/Especialidad"],
  ["chequeo_cmi_apto","Chequeo/CMI/Apto"],["unr","UNR"],["cognitiva","Cognitiva"],
  ["hospital_dia_cognitiva","Hospital de día/Cognitiva"],
  ["hospital_dia_psiquiatrico","Hospital de día/Psiquiátrico"],
  ["gedyt","GEDYT"],["psoriahue","Psoriahue"],
];
const SUBTIPOS_NO_TURNO=[
  ["precio","Precio"],["cobertura","Cobertura"],["prestacion","Prestación"],
  ["sin_agenda","Sin agenda"],["whatsapp","Se continúa por WhatsApp"],
  ["info_imagenes","Info/email imágenes"],
  ["info_consultorios_externos","Info/email consultorios externos"],
  ["info_4to_piso","Info 4to piso"],["orden_vencida","Orden vencida"],
  ["email_supervision","Email supervisión"],["fecha_turno","Fecha de turno"],
  ["call_cortada","Se cortó la llamada"],["no_portal","No puede ingresar al portal"],
  ["receta_orden_resultado","Receta/orden/resultado"],
  ["lab_rx_demanda","Lab/RX demanda espontánea"],
];
function wireTipificacion(token){
  const tipoSel=document.getElementById("tipTipo");
  const subtipoRow=document.getElementById("tipSubtipoRow");
  const subtipoSel=document.getElementById("tipSubtipo");
  const turnoFlags=document.getElementById("tipTurnoFlags");
  const turnoFields=document.getElementById("tipTurnoFields");
  const btn=document.getElementById("tipGuardar");
  const msg=document.getElementById("tipMsg");
  function syncTipo(){
    const tipo=tipoSel.value;
    const isTurno=tipo==="turno";
    turnoFlags.style.display=isTurno?"grid":"none";
    turnoFields.style.display=isTurno?"grid":"none";
    subtipoRow.style.display=tipo==="cancelado"?"none":"flex";
    const opts=isTurno?SUBTIPOS_TURNO:SUBTIPOS_NO_TURNO;
    subtipoSel.innerHTML=opts.map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join("");
  }
  tipoSel.addEventListener("change",syncTipo);
  syncTipo();
  btn.addEventListener("click",async()=>{
    msg.textContent="";msg.className="tip-msg";
    btn.disabled=true;
    const tipo=tipoSel.value;
    const body={token,tipo};
    if(tipo!=="cancelado")body.subtipo=subtipoSel.value;
    if(tipo==="turno"){
      body.particular=document.getElementById("tipParticular").checked;
      body.reprogramado=document.getElementById("tipReprogramado").checked;
      body.cantidad_turnos=parseInt(document.getElementById("tipCantidad").value,10)||1;
      const esp=document.getElementById("tipEspecialidad").value.trim();
      if(esp)body.especialidad=esp;
    }
    const obs=document.getElementById("tipObs").value.trim();
    if(obs)body.observacion=obs;
    try{
      const r=await fetch("/api/panel/tipificar",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
      });
      if(!r.ok){
        const data=await r.json().catch(()=>({}));
        msg.textContent=data.error||("Error al guardar ("+r.status+")");
        msg.className="tip-msg error";
        btn.disabled=false;
        return;
      }
      msg.textContent="Guardado. Cerrando…";
      msg.className="tip-msg ok";
      setTimeout(()=>window.close(),400);
    }catch(e){
      msg.textContent="Error de conexión";
      msg.className="tip-msg error";
      btn.disabled=false;
    }
  });
}
</script>
</body>
</html>`;
}
