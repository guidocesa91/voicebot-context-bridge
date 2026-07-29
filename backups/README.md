# Backups de la config de ElevenLabs

Snapshots crudos de la API, tal cual los devuelve el `GET`. Sirven para restaurar el agente
si un cambio lo rompe.

| Archivo | Qué es |
|---|---|
| `agent_FULL_20260729-121745.json` | Config completa **antes** del ajuste de calidad. `gemini-2.5-flash`, `temperature 0.0`, TTS latency 3, ASR sin keywords. |
| `tools_FULL_20260729-121745.json` | Todas las tools del workspace (incluye `guardar_contexto`). |
| `agent_FULL_20260729-122828_post-calidad.json` | Config **después** del ajuste. Es la que está viva hoy. |

Agente: `agent_3001kynj11tvfbq8ezwye94j7rfj` ("Test Context Bridge").

## Cómo hacer un backup nuevo

```bash
K=$(grep '^ELEVENLABS_API_KEY=' .env.local | cut -d= -f2-)
TS=$(date +%Y%m%d-%H%M%S)
curl -s -H "xi-api-key: $K" \
  "https://api.elevenlabs.io/v1/convai/agents/agent_3001kynj11tvfbq8ezwye94j7rfj" \
  -o "backups/agent_FULL_${TS}.json"
curl -s -H "xi-api-key: $K" "https://api.elevenlabs.io/v1/convai/tools" \
  -o "backups/tools_FULL_${TS}.json"
```

## Cómo restaurar

Del snapshot se toma `conversation_config` y se manda por `PATCH`. Ojo con tres trampas:

1. **No mandar `tools` y `tool_ids` juntos** — la API responde
   `both_tools_and_tool_ids_provided`. Mandar solo `tools`, con las definiciones inline.
2. **Escribir el archivo del patch en UTF-8 explícito.** En Windows, `json.dump` con
   `ensure_ascii=False` usa cp1252 por defecto y la API rechaza con
   `invalid_unicode: Request body contains invalid UTF-8 encoding`.
   Usar `io.open(path, 'w', encoding='utf-8')` y mandar
   `Content-Type: application/json; charset=utf-8`.
3. **Si se toca `built_in_tools`, mandarlo entero**, no parcial.

```bash
curl -s -X PATCH -H "xi-api-key: $K" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary "@patch.json" \
  "https://api.elevenlabs.io/v1/convai/agents/agent_3001kynj11tvfbq8ezwye94j7rfj"
```

## Verificación post-restore (siempre)

El flujo del REFER depende de esto. Chequear que sigan intactos:

- `tools` = `['guardar_contexto', 'transfer_to_number']`
- destino = `sip:9999@200.41.236.251` y `transfer_type` = `sip_refer`
- webhook = `https://contexto-bridge.duckdns.org/api/context`
- en el prompt, `guardar_contexto` aparece **antes** que la transferencia
