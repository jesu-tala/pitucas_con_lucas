/**
 * Pitucas sin lucas — lector de boletas (OCR con Gemini)
 * ---------------------------------------------------------------------------
 * Este archivo va completo, tal cual, en un Cloudflare Worker (gratis, sin
 * necesidad de dominio propio ni instalar nada en tu computador) -- es un Worker
 * SEPARADO del de notificaciones push (cloudflare-worker/worker.js), aunque
 * comparte el mismo código de invitación (import_token) para autenticarse.
 *
 * Qué hace: recibe la foto de una boleta desde la app (ya achicada a tu celular),
 * se la manda a Gemini 2.0 Flash (el modelo de Google más barato con visión) con
 * instrucciones de devolver SOLO un JSON con los items (nombre + precio), y se
 * lo pasa de vuelta a la app -- no hace falta que ella escriba nada a mano salvo
 * que algo salga mal.
 *
 * Nota: se eligió Gemini en vez de Document AI (el parser de boletas dedicado de
 * Google, más barato en teoría) porque Document AI necesita autenticarse con una
 * clave de cuenta de servicio, y muchas cuentas de Google Cloud nuevas traen por
 * defecto la política "iam.disableServiceAccountKeyCreation" que bloquea crear
 * esas claves -- Gemini en cambio usa una API key simple (sin ese problema) y,
 * en la práctica, termina siendo igual de barato o más para este volumen de uso.
 *
 * CÓMO INSTALARLO (una sola vez):
 *
 *  A) Google AI Studio — conseguir la API key (mucho más simple que Document AI,
 *     no hace falta cuenta de servicio ni proyecto de Google Cloud aparte):
 *   1. Ve a https://aistudio.google.com/apikey (con la misma cuenta de Google
 *      que uses para lo demás).
 *   2. Aprieta "Create API key" (o "Crear clave de API") → elige un proyecto de
 *      Google Cloud existente (puede ser el mismo que ya tengas) o deja que cree
 *      uno nuevo.
 *   3. Copia la clave que te muestra (empieza con "AIza...") -- la vas a pegar
 *      en el paso C. Trátala como una contraseña: quien la tenga puede gastar
 *      tu cuota gratis/tu plata en llamadas a Gemini.
 *
 *  B) Cloudflare — crear el Worker:
 *   1. Ve a https://dash.cloudflare.com → Workers & Pages → Create application
 *      → pestaña "Workers" → "Create Worker" (dale un nombre, ej. plata-clara-ocr).
 *   2. Te abre el editor — borra todo y pega este archivo completo. Deploy.
 *
 *  C) Cloudflare — configurar las variables del Worker recién creado:
 *   Ve a tu Worker → Settings → Variables and Secrets → agrega estas 3 (todas
 *   como "secret" salvo que digan lo contrario):
 *     SUPABASE_URL           = https://wuxdctmhbuttzssiknkt.supabase.co
 *     SUPABASE_ANON_KEY      = (el mismo anon key que ya usa la app)
 *     GEMINI_API_KEY          = la clave "AIza..." del paso A.3
 *
 *   Copia la URL del Worker (algo como https://plata-clara-ocr.tu-cuenta.workers.dev)
 *   y pégala en src/supabase.ts, reemplazando OCR_WORKER_URL -- después
 *   corre `python3 rebuild.py` y vuelve a subir public/ a Cloudflare Pages.
 *
 * Qué expone: un solo endpoint, POST /leer-boleta -- lo llama la app cada vez
 * que tocas "Tomar foto" o "Elegir de galería" en el paso de escanear una
 * boleta. No expone nada útil para quien no tenga el código de tu hogar (se
 * valida contra Supabase en cada llamada, ver verificar_household en
 * schema_ocr_boleta.sql).
 */

// ---------- Gemini: mandar la foto y pedirle un JSON estructurado ----------
// generationConfig.responseSchema fuerza a Gemini a devolver el JSON con esta
// forma exacta (sin que tenga que "adivinar" el formato por el prompt solo) --
// ver https://ai.google.dev/gemini-api/docs/structured-output
const GEMINI_RESPONSE_SCHEMA_ = {
  type: 'OBJECT',
  properties: {
    comercio: { type: 'STRING', nullable: true },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nombre: { type: 'STRING' },
          monto: { type: 'NUMBER' }
        },
        required: ['nombre', 'monto']
      }
    }
  },
  required: ['items']
};

const GEMINI_PROMPT_ =
  'Lee esta foto de una boleta o recibo (probablemente chileno) y devuelve un JSON con el ' +
  'comercio y la lista de items comprados (nombre + precio en pesos, como número entero sin ' +
  'puntos ni símbolos). No incluyas el total, subtotal, IVA ni la propina como si fueran un ' +
  'item más -- esos se calculan aparte. Si dos líneas iguales aparecen juntas con una cantidad ' +
  '("Coca-Cola x2"), trátalas como UN solo item con el precio total de esa línea, no dos. Si no ' +
  'logras leer un precio con confianza, no inventes un número -- omite ese item.';

async function llamarGemini_(env, imageBase64) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + env.GEMINI_API_KEY;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: GEMINI_PROMPT_ },
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
        ]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA_
      }
    })
  });
  if (!res.ok) {
    throw new Error('Gemini respondió con error: ' + await res.text());
  }
  return res.json();
}

// Con responseSchema, el texto que devuelve Gemini YA es un JSON válido con la forma pedida --
// igual se envuelve en try/catch por si alguna vez cambia el formato de la respuesta o el
// modelo se sale del esquema (pasa de vez en cuando con cualquier modelo de IA).
function parsearRespuestaGemini_(data) {
  const texto = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!texto) return { comercio: null, items: [] };
  let parsed;
  try { parsed = JSON.parse(texto); } catch (e) { return { comercio: null, items: [] }; }
  const items = Array.isArray(parsed.items)
    ? parsed.items
        .filter(function(it){ return it && it.nombre && typeof it.monto === 'number' && it.monto > 0; })
        .map(function(it){ return { nombre: String(it.nombre).trim(), monto: Math.round(it.monto) }; })
    : [];
  return { comercio: parsed.comercio ? String(parsed.comercio).trim() : null, items: items };
}

// ---------- Supabase: validar que el household_id + token correspondan a un hogar real ----------

async function callSupabaseRpc_(env, fnName, args) {
  return fetch(env.SUPABASE_URL + '/rest/v1/rpc/' + fnName, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
}

// CORS: la app vive en un dominio (Cloudflare Pages) y este Worker en otro
// (workers.dev) -- sin estos headers, el navegador bloquea la respuesta antes de que el
// JS de la app pueda leerla. `*` es seguro acá: este endpoint no depende de cookies/sesión
// de navegador para autenticarse, solo del household_id + token que van en el cuerpo del POST.
const CORS_HEADERS_ = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonResponse_(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS_)
  });
}

async function handleLeerBoleta_(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse_({ error: 'JSON inválido' }, 400);
  }
  const householdId = body && body.household_id;
  const token = body && body.token;
  const imageBase64 = body && body.image_base64;
  if (!householdId || !token || !imageBase64) {
    return jsonResponse_({ error: 'Faltan household_id, token o image_base64' }, 400);
  }

  const validacion = await callSupabaseRpc_(env, 'verificar_household', {
    p_household_id: householdId, p_token: token
  });
  if (!validacion.ok) {
    return jsonResponse_({ error: 'No se pudo validar el hogar/código de importación' }, 401);
  }
  const esValido = await validacion.json();
  if (esValido !== true) {
    return jsonResponse_({ error: 'Código de importación inválido para ese hogar' }, 401);
  }

  let data;
  try {
    data = await llamarGemini_(env, imageBase64);
  } catch (err) {
    console.error('Pitucas sin lucas OCR — error llamando a Gemini:', err);
    return jsonResponse_({ error: 'No se pudo leer la boleta con Gemini' }, 502);
  }

  const { comercio, items } = parsearRespuestaGemini_(data);
  if (items.length === 0) {
    // No se armó ningún item -- se deja registrada la respuesta cruda en el log del Worker
    // (Cloudflare dashboard > tu Worker > Logs) para poder revisar por qué sin tener que
    // adivinar; el mismo criterio que se usó toda la sesión con los correos del banco que
    // no calzaban con ninguna regla.
    console.log('Pitucas sin lucas OCR — sin items, respuesta cruda de Gemini:', JSON.stringify(data));
  }
  return jsonResponse_({ comercio: comercio, items: items });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname === '/leer-boleta') {
      return new Response(null, { status: 204, headers: CORS_HEADERS_ });
    }
    if (request.method === 'POST' && url.pathname === '/leer-boleta') {
      try {
        return await handleLeerBoleta_(request, env);
      } catch (err) {
        return jsonResponse_({ error: String(err && err.message || err) }, 500);
      }
    }
    return new Response('Pitucas sin lucas — lector de boletas. Nada que ver por acá directamente.', { status: 200, headers: CORS_HEADERS_ });
  }
};
