import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod/v4";
import { config } from "../config.js";
import { verifyPassword } from "../lib/password.js";
import { signSupervisorToken, verifySupervisorToken } from "../lib/tokens.js";
import { exportRange } from "../store/sqlite.js";
import type { LlamadaRecord } from "../types.js";

const loginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const exportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function requireSupervisor(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing or invalid Authorization header" });
    return false;
  }
  const claims = await verifySupervisorToken(auth.slice(7));
  if (!claims) {
    reply.code(401).send({ error: "Invalid or expired token" });
    return false;
  }
  return true;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const TIPO_LABEL: Record<string, string> = {
  turno: "Turno",
  no_turno: "No turno",
  cancelado: "Cancelado",
};

const SUBTIPO_LABEL: Record<string, string> = {
  // turno
  reso: "RESO",
  tomo: "TOMO",
  eco_doppler: "ECO/Doppler",
  eeg: "EEG",
  emg: "EMG",
  consultorio_especialidad: "Consultorio/Especialidad",
  chequeo_cmi_apto: "Chequeo/CMI/Apto",
  unr: "UNR",
  cognitiva: "Cognitiva",
  hospital_dia_cognitiva: "Hospital de día/Cognitiva",
  hospital_dia_psiquiatrico: "Hospital de día/Psiquiátrico",
  gedyt: "GEDYT",
  psoriahue: "Psoriahue",
  // no_turno
  precio: "Precio",
  cobertura: "Cobertura",
  prestacion: "Prestación",
  sin_agenda: "Sin agenda",
  whatsapp: "Se continúa por WhatsApp",
  info_imagenes: "Info/email imágenes",
  info_consultorios_externos: "Info/email consultorios externos",
  info_4to_piso: "Info 4to piso",
  orden_vencida: "Orden vencida",
  email_supervision: "Email supervisión",
  fecha_turno: "Fecha de turno",
  call_cortada: "Se cortó la llamada",
  no_portal: "No puede ingresar al portal",
  receta_orden_resultado: "Receta/orden/resultado",
  lab_rx_demanda: "Lab/RX demanda espontánea",
};

function toCsv(rows: LlamadaRecord[]): string {
  const headers = [
    "fecha",
    "numero",
    "conversation_id",
    "tipo",
    "subtipo",
    "particular",
    "reprogramado",
    "cantidad_turnos",
    "especialidad",
    "observacion",
    "intencion",
    "resumen",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.created_at,
        r.caller_number,
        r.conversation_id,
        TIPO_LABEL[r.tipo] ?? r.tipo,
        r.subtipo ? (SUBTIPO_LABEL[r.subtipo] ?? r.subtipo) : "",
        r.particular ? "Sí" : "",
        r.reprogramado ? "Sí" : "",
        r.cantidad_turnos,
        r.especialidad,
        r.observacion,
        r.intent,
        r.summary,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export async function supervisorRoutes(app: FastifyInstance) {
  app.post("/supervisor/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }
    const { username, password } = parsed.data;

    const validUser =
      !!config.supervisorUsername && username === config.supervisorUsername;
    const validPassword =
      !!config.supervisorPasswordHash &&
      verifyPassword(password, config.supervisorPasswordHash);

    if (!validUser || !validPassword) {
      return reply.code(401).send({ error: "Usuario o contraseña inválidos" });
    }

    const token = await signSupervisorToken({ sub: username });
    return reply.send({ token });
  });

  app.get("/supervisor/export", async (request, reply) => {
    if (!(await requireSupervisor(request, reply))) return;

    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Parámetros from/to inválidos (YYYY-MM-DD)" });
    }
    const { from, to } = parsed.data;
    const fromISO = `${from}T00:00:00.000Z`;
    const toISO = `${to}T23:59:59.999Z`;

    const rows = exportRange(fromISO, toISO);
    const csv = toCsv(rows);

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="llamadas_${from}_${to}.csv"`,
      )
      .send(csv);
  });

  app.get("/supervisor", async (_request, reply) => {
    return reply.type("text/html").send(supervisorHtml());
  });
}

function supervisorHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel de supervisor</title>
<style>
  :root{
    --bg:#eef2f6; --surface:#fff; --ink:#0f1f2b; --muted:#5b6b7c;
    --faint:#93a3b3; --line:#dfe6ed; --accent:#0e7490; --accent-soft:#e0f2f4;
    --sans:"Segoe UI",system-ui,-apple-system,sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--bg);
    display:flex;justify-content:center;padding:48px 16px;-webkit-font-smoothing:antialiased}
  .box{background:var(--surface);border:1px solid var(--line);border-radius:12px;
    padding:28px 26px;max-width:380px;width:100%;box-shadow:0 1px 2px rgba(15,31,43,.04)}
  h1{font-size:16px;margin-bottom:18px}
  .row{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
  label{font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;
    letter-spacing:.07em}
  input{font:inherit;font-size:13.5px;background:var(--bg);border:1px solid var(--line);
    border-radius:8px;padding:9px 11px;width:100%}
  button{width:100%;background:var(--accent);color:#fff;border:none;border-radius:9px;
    padding:12px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  button:disabled{opacity:.55;cursor:default}
  .msg{font-size:12.5px;text-align:center;margin-top:10px;min-height:16px}
  .msg.error{color:#b3261e}
  .msg.ok{color:var(--accent)}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  [hidden]{display:none}
</style>
</head>
<body>
<div class="box">
  <h1>Panel de supervisor</h1>

  <div id="login">
    <div class="row"><label for="user">Usuario</label><input id="user" autocomplete="username"></div>
    <div class="row"><label for="pass">Contraseña</label><input id="pass" type="password" autocomplete="current-password"></div>
    <button id="loginBtn" type="button">Ingresar</button>
    <div id="loginMsg" class="msg"></div>
  </div>

  <div id="panel" hidden>
    <div class="two">
      <div class="row"><label for="from">Desde</label><input id="from" type="date"></div>
      <div class="row"><label for="to">Hasta</label><input id="to" type="date"></div>
    </div>
    <button id="exportBtn" type="button">Exportar CSV</button>
    <div id="exportMsg" class="msg"></div>
  </div>
</div>
<script>
let token=null;
const loginDiv=document.getElementById("login");
const panelDiv=document.getElementById("panel");
const loginMsg=document.getElementById("loginMsg");
const exportMsg=document.getElementById("exportMsg");

const toStr=d=>d.toISOString().slice(0,10);
const today=new Date();
const monthAgo=new Date(today.getTime()-29*86400000);
document.getElementById("to").value=toStr(today);
document.getElementById("from").value=toStr(monthAgo);

document.getElementById("loginBtn").addEventListener("click",async()=>{
  const username=document.getElementById("user").value.trim();
  const password=document.getElementById("pass").value;
  loginMsg.textContent="";loginMsg.className="msg";
  try{
    const r=await fetch("/supervisor/login",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username,password}),
    });
    const data=await r.json();
    if(!r.ok){
      loginMsg.textContent=data.error||"Error al ingresar";
      loginMsg.className="msg error";
      return;
    }
    token=data.token;
    loginDiv.hidden=true;
    panelDiv.hidden=false;
  }catch(e){
    loginMsg.textContent="Error de conexión";
    loginMsg.className="msg error";
  }
});

document.getElementById("exportBtn").addEventListener("click",async()=>{
  const from=document.getElementById("from").value;
  const to=document.getElementById("to").value;
  exportMsg.textContent="";exportMsg.className="msg";
  try{
    const r=await fetch("/supervisor/export?from="+from+"&to="+to,{
      headers:{Authorization:"Bearer "+token},
    });
    if(!r.ok){
      const data=await r.json().catch(()=>({}));
      exportMsg.textContent=data.error||("Error al exportar ("+r.status+")");
      exportMsg.className="msg error";
      return;
    }
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download="llamadas_"+from+"_"+to+".csv";
    a.click();
    URL.revokeObjectURL(url);
  }catch(e){
    exportMsg.textContent="Error de conexión";
    exportMsg.className="msg error";
  }
});
</script>
</body>
</html>`;
}
