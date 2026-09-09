/**
 * Pitucas sin lucas — lector de boletas (OCR)
 * ---------------------------------------------------------------------------
 * Este archivo va completo, tal cual, en un Cloudflare Worker (gratis, sin
 * necesidad de dominio propio ni instalar nada en tu computador) -- es un Worker
 * SEPARADO del de notificaciones push (cloudflare-worker/worker.js), aunque
 * comparte el mismo código de invitación (import_token) para autenticarse.
 *
 * Qué hace: recibe la foto de una boleta desde la app (ya achicada a tu celular),
 * se la manda al parser de boletas de Google Document AI, y devuelve los items
 * (nombre + precio) ya separados, listos para el paso "Revisa los items" de la
 * app -- no hace falta que ella escriba nada a mano salvo que algo salga mal.
 *
 * CÓMO INSTALARLO (una sola vez):
 *
 *  A) Google Cloud — crear el parser de boletas:
 *   1. Ve a https://console.cloud.google.com/ y crea un proyecto nuevo (o usa uno
 *      que ya tengas), ej. "pitucas-sin-lucas".
 *   2. Busca "Document AI" en el buscador de arriba → "Habilitar API" (si te pide
 *      activar facturación, Document AI tiene un tier gratis mensual generoso —
 *      no debería cobrarte nada con un uso normal de la app).
 *   3. Ve a Document AI → "Explorador de procesadores" → "Crear procesador" →
 *      busca "Expense Parser" (o "Receipt Parser" si no aparece el primero) →
 *      Crear. Anota el "ID del procesador" (una cadena de letras y números) y la
 *      "Región/ubicación" que elegiste (ej. "us" o "eu") -- los vas a necesitar
 *      en el paso C.
 *   4. Ve a "IAM y administración" → "Cuentas de servicio" → "Crear cuenta de
 *      servicio" (ej. "boletas-worker"). En el paso de permisos, agrégale el rol
 *      "Usuario de Document AI" (Document AI API User) -- no le des más permisos
 *      que ese, no los necesita.
 *   5. Entra a la cuenta de servicio recién creada → pestaña "Claves" → "Agregar
 *      clave" → "Crear clave nueva" → tipo JSON → Crear. Se descarga un archivo
 *      .json -- ábrelo, ahí están los 3 datos que necesitas para el paso C:
 *      "project_id", "client_email" y "private_key". Guarda ese archivo en un
 *      lugar seguro (o bórralo después de copiar los datos) -- quien lo tenga
 *      puede usar tu cuenta de Document AI.
 *
 *  B) Cloudflare — crear el Worker:
 *   1. Ve a https://dash.cloudflare.com → Workers & Pages → Create application
 *      → pestaña "Workers" → "Create Worker" (dale un nombre, ej. plata-clara-ocr).
 *   2. Te abre el editor — borra todo y pega este archivo completo. Deploy.
 *
 *  C) Cloudflare — configurar las variables del Worker recién creado:
 *   Ve a tu Worker → Settings → Variables and Secrets → agrega estas 7 (todas
 *   como "secret" salvo que digan lo contrario):
 *     SUPABASE_URL           = https://wuxdctmhbuttzssiknkt.supabase.co
 *     SUPABASE_ANON_KEY      = (el mismo anon key que ya usa la app)
 *     GOOGLE_PROJECT_ID      = el "project_id" del archivo .json (paso A.5)
 *     GOOGLE_CLIENT_EMAIL    = el "client_email" del archivo .json (paso A.5)
 *     GOOGLE_PRIVATE_KEY     = el "private_key" del archivo .json (paso A.5) --
 *                              pégalo COMPLETO tal cual viene, con los
 *                              "-----BEGIN PRIVATE KEY-----" y los saltos de
 *                              línea incluidos. Si tu editor los convierte en
 *                              "\n" literales (dos caracteres, barra + n) no
 *                              pasa nada, este Worker los normaliza solo.
 *     GOOGLE_LOCATION         = la región que elegiste en el paso A.3 (ej. "us")
 *     GOOGLE_PROCESSOR_ID     = el ID del procesador del paso A.3
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

// ---------- Google Cloud: autenticación de cuenta de servicio ----------
// Document AI no acepta una API key simple -- hay que autenticarse como la cuenta
// de servicio firmando un JWT con su clave privada (RS256) y canjeándolo por un
// token de acceso, exactamente el mismo mecanismo que usa cualquier servidor
// (https://developers.google.com/identity/protocols/oauth2/service-account).
// Cloudflare Workers trae Web Crypto nativo, así que no hace falta ninguna
// librería externa para esto.

function base64UrlEncode_(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Acepta la clave privada tanto con saltos de línea reales como con "\n" literales
// (dos caracteres) -- lo segundo pasa seguido cuando se copia una clave desde un
// JSON o una terminal que "aplana" los saltos de línea, y sin esto la clave queda
// mal formada y crypto.subtle.importKey falla con un error críptico.
function pemAClavePrivada_(pem) {
  const limpio = String(pem).replace(/\\n/g, '\n');
  const b64 = limpio
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8', bytes.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
}

async function obtenerAccessToken_(env) {
  const ahora = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600
  };
  const encHeader = base64UrlEncode_(new TextEncoder().encode(JSON.stringify(header)));
  const encClaims = base64UrlEncode_(new TextEncoder().encode(JSON.stringify(claims)));
  const paraFirmar = encHeader + '.' + encClaims;

  const clave = await pemAClavePrivada_(env.GOOGLE_PRIVATE_KEY);
  const firma = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(paraFirmar)
  );
  const jwt = paraFirmar + '.' + base64UrlEncode_(new Uint8Array(firma));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
      '&assertion=' + encodeURIComponent(jwt)
  });
  if (!res.ok) {
    throw new Error('No se pudo autenticar con Google: ' + await res.text());
  }
  const data = await res.json();
  return data.access_token;
}

// ---------- Google Document AI: mandar la foto y leer la respuesta ----------

async function llamarDocumentAI_(env, imageBase64) {
  const accessToken = await obtenerAccessToken_(env);
  const location = env.GOOGLE_LOCATION || 'us';
  const url = 'https://' + location + '-documentai.googleapis.com/v1/projects/' +
    env.GOOGLE_PROJECT_ID + '/locations/' + location + '/processors/' +
    env.GOOGLE_PROCESSOR_ID + ':process';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawDocument: { content: imageBase64, mimeType: 'image/jpeg' } })
  });
  if (!res.ok) {
    throw new Error('Document AI respondió con error: ' + await res.text());
  }
  return res.json();
}

// El Expense Parser de Document AI devuelve un documento con una lista plana de
// "entidades" (document.entities[]) -- cada una tiene un type_ (ej. "line_item",
// "supplier_name", "total_amount") y, para line_item específicamente, sub-entidades
// propias en properties[] (ej. "line_item/description", "line_item/amount"). Ver
// https://cloud.google.com/document-ai/docs/processors-list#processor_expense-parser
function montoDesdeEntidad_(ent) {
  if (ent.normalizedValue && ent.normalizedValue.moneyValue) {
    const mv = ent.normalizedValue.moneyValue;
    const unidades = parseInt(mv.units || '0', 10);
    const nanos = mv.nanos || 0;
    return unidades + Math.round(nanos / 1e9);
  }
  // Si no vino el valor normalizado, se intenta con el texto tal cual lo leyó
  // (formato chileno: punto de miles, coma decimal).
  const crudo = String(ent.mentionText || '').replace(/[^\d.,]/g, '');
  if (!crudo) return null;
  const n = parseFloat(crudo.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : Math.round(n);
}

function parsearDocumentAI_(doc) {
  const entidades = (doc && doc.document && doc.document.entities) || [];
  let comercio = null;
  const items = [];
  entidades.forEach(function(ent){
    if (ent.type_ === 'supplier_name' && !comercio) {
      comercio = (ent.mentionText || '').trim() || null;
    }
    if (ent.type_ === 'line_item') {
      let nombre = null, monto = null;
      (ent.properties || []).forEach(function(p){
        if (p.type_ === 'line_item/description') nombre = (p.mentionText || '').trim() || null;
        if (p.type_ === 'line_item/amount') monto = montoDesdeEntidad_(p);
      });
      if (nombre && monto != null && monto > 0) items.push({ nombre: nombre, monto: monto });
    }
  });
  return { comercio: comercio, items: items };
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

  let doc;
  try {
    doc = await llamarDocumentAI_(env, imageBase64);
  } catch (err) {
    console.error('Pitucas sin lucas OCR — error llamando a Document AI:', err);
    return jsonResponse_({ error: 'No se pudo leer la boleta con Google Document AI' }, 502);
  }

  const { comercio, items } = parsearDocumentAI_(doc);
  if (items.length === 0) {
    // No se armó ningún item -- se deja registrado el detalle crudo en el log del Worker
    // (Cloudflare dashboard > tu Worker > Logs) para poder revisar por qué sin tener que
    // adivinar; el mismo criterio que se usó toda la sesión con los correos del banco que
    // no calzaban con ninguna regla.
    console.log('Pitucas sin lucas OCR — sin items, entidades crudas:', JSON.stringify((doc && doc.document && doc.document.entities) || []));
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
