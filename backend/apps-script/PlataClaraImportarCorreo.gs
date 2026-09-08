/**
 * Pitucas sin lucas — importar transacciones automáticamente desde tu Gmail
 * ---------------------------------------------------------------------
 * Qué hace: cada cierto tiempo (el trigger que configures abajo) revisa tus correos de
 * notificación bancaria más recientes, saca de ahí el monto/comercio/fecha, y se lo manda
 * a tu base de datos — apenas abras (o vuelvas a) la pestaña Transacciones de la app, ahí
 * aparece marcada como pendiente (sin categoría), igual que cualquier otra transacción sin
 * clasificar. Tú la clasificas ahí mismo.
 *
 * CÓMO INSTALARLO (una sola vez):
 *  1. Ve a https://script.google.com/ → "Proyecto nuevo".
 *  2. Borra el contenido de "Código.gs" y pega ESTE archivo completo.
 *  3. Reemplaza las 4 constantes de configuración de más abajo:
 *       - SUPABASE_URL y SUPABASE_ANON_KEY: ya vienen puestos, son los mismos que usa la app.
 *       - HOUSEHOLD_ID y IMPORT_TOKEN: ábrelos desde la propia app — Menú > "Importar
 *         desde tu correo" te los muestra con un botón de copiar al lado de cada uno.
 *       - PUSH_WORKER_URL (opcional): solo si ya desplegaste el Worker de notificaciones
 *         push (cloudflare-worker/worker.js) — la URL te la da Cloudflare al crearlo. Si la
 *         dejas como está, el script sigue funcionando igual, simplemente no manda el aviso
 *         push de "llegó una transacción nueva".
 *  4. Arriba, en la barra de funciones, elige "revisarCorreos" y aprieta "Ejecutar" una vez
 *     — Google te va a pedir autorizar el script para leer tu Gmail (es normal, es tu propio
 *     script corriendo en tu propia cuenta). Revisa el log (Ver > Registros) para confirmar
 *     que no hubo errores.
 *  5. Para que corra solo: ícono del reloj (Activadores) a la izquierda → "Añadir activador"
 *     → función "revisarCorreos" → tipo de evento "Basado en tiempo" → "Temporizador de
 *     minutos" cada 30 o 60 minutos (lo que prefieras). Guardar.
 *
 * Ya está. De ahí en adelante corre solo, sin que tengas que abrir nada.
 *
 * Formatos de correo que reconoce hoy: compras y cargos de Banco de Chile/Banco Edwards,
 * transferencias a terceros de Banco de Chile, órdenes de compra/venta de Racional, y
 * compras de Movired (bip!). Si más adelante te llegan notificaciones de otro banco y
 * quieres que también se sumen, mándame un correo de ejemplo (con los datos sensibles
 * tapados si quieres) y te agrego la regla.
 *
 * Además de eso: cada vez que corre, revisarCorreos() también busca el correo mensual de
 * "Cartola Cuenta Corriente" y "Estado de Cuenta Tarjeta de Crédito" de Banco Edwards, y le
 * saca el PDF adjunto (que sigue viniendo con la clave puesta por el banco) para guardarlo
 * en tu cuenta — así, cuando entres a Menú > "Reconciliar con la cartola" en la app, ya te
 * la va a ofrecer directo, sin que tengas que ir a buscar el correo tú misma. Ese PDF NUNCA
 * se desencripta acá ni en ningún servidor: sigue cifrado hasta que tú misma pones la clave
 * en tu navegador, dentro de la app.
 */

// ---------- CONFIGURACIÓN: reemplaza estos 2 valores ----------
var SUPABASE_URL = 'https://wuxdctmhbuttzssiknkt.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_uLIIyeomS52mPIie__KvAA_ErW-lYhb';
var HOUSEHOLD_ID = 'PEGA_AQUI_TU_HOUSEHOLD_ID';           // Menú > Importar desde tu correo, en la app
var IMPORT_TOKEN = 'PEGA_AQUI_TU_CODIGO_DE_IMPORTACION';  // idem, el segundo campo

// Notificaciones push: la URL del Cloudflare Worker que manda el aviso a tu celular cada vez
// que este script encuentra una transacción nueva (ver cloudflare-worker/worker.js). Déjalo
// como está si todavía no activaste las notificaciones push — el script sigue funcionando
// igual, simplemente no manda ese aviso extra.
var PUSH_WORKER_URL = 'https://curly-thunder-b4c6.talajesu.workers.dev';

// Cuántos días hacia atrás revisar en cada pasada — con el trigger corriendo cada 30-60
// minutos, 3 días de margen alcanza de sobra y evita perderse un correo si el script no
// corrió por un rato (viaje, sin datos, etc.). No hay riesgo de duplicados: la base de
// datos ignora cualquier correo que ya haya visto antes (se identifica por su id de Gmail).
var WINDOW_DAYS = 3;

var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function pad2_(n){ n = String(n); return n.length < 2 ? '0' + n : n; }
function montoCLP_(s){ return parseFloat(String(s).replace(/\./g, '').replace(',', '.')); }
function montoUSD_(s){ return parseFloat(String(s).replace(/,/g, '')); }

// ---------- reglas: una por cada tipo de correo que sabemos leer ----------
var RULES = [
  {
    id: 'banco_edwards_compra',
    query: 'from:enviodigital@bancoedwards.cl (subject:"Compra con Tarjeta de Crédito" OR subject:"Cargo en Cuenta")',
    parse: function(bodyText){
      // Gmail parte el texto plano en líneas de ancho fijo, y el corte puede caer justo en
      // medio de la frase (ej. "...Tarjeta de" termina la línea y "Crédito ****0507..." sigue
      // en la siguiente) — por eso cada espacio entre palabras se busca con \s+ (que también
      // matchea un salto de línea) en vez de un espacio literal, y el nombre del comercio con
      // [\s\S]+? en vez de .+? (que no cruza saltos de línea).
      // Los 4 dígitos pueden venir pegados al "****" (****0507) o con un espacio de por medio
      // (**** 0507), y algunos correos usan • en vez de asterisco — por eso [\*•]+\s* en vez
      // de \*\*\*\* a secas, y \d{4} (exactamente 4) en vez de \d+ (que podría comerse de más).
      // Con /i: nada obliga a que el banco mande siempre "compra" en minúscula (ej. si la
      // frase empieza mayúscula porque cambiaron la plantilla del correo) -- antes esto
      // dependía de la mayúscula exacta y podía dejar de calzar en silencio.
      // Las compras en el extranjero (ej. un viaje) vienen en dólares: "compra por US$51,25"
      // en vez de "compra por $51.250" -- el "US" opcional antes del "$" distingue ambos casos.
      // El monto igual se lee con montoCLP_ (coma como separador decimal) porque el banco usa
      // SU formato chileno de números incluso para montos en dólares ("51,25" = US$51.25, no
      // 5125) -- no es el mismo formato que montoUSD_ (pensado para números ya en formato
      // estadounidense, como los que manda Racional). El monto queda en dólares tal cual sin
      // convertir (no hay tipo de cambio en el correo), marcado con "(USD)" en el comercio,
      // igual que ya se hace con las compras de racional_orden.
      var re = /compra\s+por\s+(US)?\$([\d.,]+)\s+con\s+(?:Tarjeta\s+de\s+Cr[ée]dito\s+[\*•]+\s*(\d{4})|cargo\s+a\s+Cuenta\s+[\*•]+\s*(\d{4}))\s+en\s+([\s\S]+?)\s+el\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/i;
      var m = bodyText.match(re);
      if (!m) return null;
      var esUSD = !!m[1];
      var last4 = m[3] || m[4];
      return {
        fecha: m[8] + '-' + m[7] + '-' + m[6], hora: m[9],
        comercio: m[5].trim() + (esUSD ? ' (USD)' : ''), monto: montoCLP_(m[2]), tipo: 'gasto',
        medio_sugerido: last4 ? ('****' + last4) : null
      };
    }
  },
  {
    id: 'banco_chile_transferencia',
    query: 'from:serviciodetransferencias@bancochile.cl subject:"Transferencia a Terceros"',
    parse: function(bodyText){
      // Mismo cuidado que en banco_edwards_compra: cualquier espacio entre palabras puede
      // en realidad ser un salto de línea si Gmail cortó ahí el texto plano.
      var montoM = bodyText.match(/Monto\s*\|?\s*\$([\d.,]+)/i);
      // El día de la semana ("sábado", "miércoles") lleva tilde -- \w en JS NO matchea letras
      // con tilde, así que un \w+ ahí se cortaba a mitad de la palabra y rompía TODO el regex
      // (encontrado con debugVerCuerpoCrudoBancoChile: un correo real de "sábado 05 de..."
      // nunca calzaba). \S+ (cualquier cosa que no sea espacio) sortea el problema sin
      // necesitar enumerar cada día de la semana a mano.
      var fechaM = bodyText.match(/Fecha\s+y\s+Hora:\s*\S+\s+(\d{1,2})\s+de\s+(\wé\w+|\w+)\s+de\s+(\d{4})\s+(\d{2}:\d{2})/i);
      var destM = bodyText.match(/Nombre\s+y\s+Apellido\s*\|?\s*([^\n|]+)/i);
      if (!montoM || !fechaM) return null;
      var mesIdx = MESES.indexOf(fechaM[2].toLowerCase());
      if (mesIdx < 0) return null;
      return {
        fecha: fechaM[3] + '-' + pad2_(mesIdx + 1) + '-' + pad2_(fechaM[1]), hora: fechaM[4],
        comercio: 'Transferencia a ' + (destM ? destM[1].trim() : 'terceros'),
        // Una transferencia a terceros sale de tu cuenta corriente/vista, nunca de una tarjeta
        // ni de efectivo — se lo decimos explícito a la app en vez de dejarlo en null (que
        // antes terminaba mostrando "Efectivo", quedando mal).
        monto: montoCLP_(montoM[1]), tipo: 'gasto', medio_sugerido: 'cuenta_vista'
      };
    }
  },
  {
    id: 'banco_chile_transferencia_recibida',
    // Esta es la plata que LE LLEGA (ella aparece como "Nombre Beneficiario", no como quien
    // manda) -- a diferencia de la regla de arriba, el asunto acá lo pone quien envía y varía
    // según el motivo del pago ("Pago de tu corredor", etc.), así que NO se puede filtrar por
    // asunto fijo. Al buscar solo por remitente, esta regla también recibe en el mismo barrido
    // los correos de "Transferencia a Terceros" de arriba -- por eso el parse() exige el bloque
    // "Datos de Destino / Nombre Beneficiario" propio de esta otra plantilla y devuelve null si
    // no lo encuentra, para no terminar importando el mismo correo dos veces bajo dos ids.
    // OJO: el regex de acá se armó a partir de UN solo correo de ejemplo (plantilla de
    // transferencia recibida desde una cuenta de empresa) -- si después de este cambio sigue sin
    // aparecer alguno, revisa el Logger de la ejecución: si dice "encontró el correo pero NO
    // logró leer los datos", es que ese correo tiene alguna etiqueta distinta a las de abajo.
    query: 'from:serviciodetransferencias@bancochile.cl',
    parse: function(bodyText){
      // Esta plantilla (cuenta de empresa) escribe varias etiquetas en negrita -- Gmail guarda
      // esa negrita como asteriscos literales en el texto plano ("*Datos de Destino*",
      // "* Monto Operación* $354.835", "*Fecha y hora: *"), y esos asteriscos quedan pegados
      // justo donde el regex esperaba el valor, rompiendo el match. Se sacan ANTES de leer nada,
      // pero solo acá (no globalmente en stripInvisibles_/bodyText): otras reglas, como
      // banco_edwards_compra, sí usan el asterisco con significado real (enmascara los dígitos
      // de la tarjeta, "****0507").
      var t = bodyText.replace(/\*/g, '');
      if (!/Datos\s+de\s+Destino/i.test(t) || !/Nombre\s+Beneficiario/i.test(t)) return null;
      var origenM = t.match(/Te informamos que\s+(.+?)\s+ha instruido/i);
      var montoM = t.match(/Monto\s+Operaci[oó]n\s*\|?\s*\$([\d.,]+)/i);
      var fechaM = t.match(/Fecha\s+y\s+hora:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/i);
      if (!montoM || !fechaM) return null;
      return {
        fecha: fechaM[3] + '-' + fechaM[2] + '-' + fechaM[1], hora: fechaM[4],
        comercio: origenM ? origenM[1].trim() : 'Transferencia recibida',
        // Le llega a su cuenta corriente/vista, no a una tarjeta ni a efectivo.
        monto: montoCLP_(montoM[1]), tipo: 'ingreso', medio_sugerido: 'cuenta_vista'
      };
    }
  },
  {
    id: 'banco_chile_transferencia_movired',
    // Transferencia que ELLA manda a Movired/Fintoc (ej. para recargar bip! desde la cuenta
    // corriente) -- mismo remitente que las dos reglas de arriba.
    // OJO: "Datos del Destinatario" / "Datos de la Transferencia" NO son etiquetas exclusivas
    // de esta plantilla -- Banco de Chile también las usa en transferencias comunes a terceros
    // (personas), así que exigir solo esos encabezados hacía que esta regla matcheara TAMBIÉN
    // transferencias normales y las importara duplicadas (una vez bien, con el nombre correcto,
    // vía otra regla; otra vez mal, con el nombre "Movired" puesto por el fallback cuando el
    // regex de "Nombre" no encontraba nada). Por eso ahora se exige además que el correo
    // mencione "Movired" o "fintoc" en alguna parte -- algo que un correo a un tercero
    // cualquiera nunca tendría -- y el comercio queda fijo en "Transferencia a Movired" en vez
    // de intentar leer el destinatario (esta regla es solo para Movired, no genérica).
    query: 'from:serviciodetransferencias@bancochile.cl',
    parse: function(bodyText){
      var t = bodyText.replace(/\*/g, '');
      if (!/Movired|fintoc/i.test(t)) return null;
      if (!/Datos\s+del\s+Destinatario/i.test(t) || !/Datos\s+de\s+la\s+Transferencia/i.test(t)) return null;
      var montoM = t.match(/Monto\s*\$([\d.,]+)/i);
      var fechaM = t.match(/Fecha\s+(\d{2})\/(\d{2})\/(\d{4})/i);
      if (!montoM || !fechaM) return null;
      return {
        // El correo no trae la hora exacta de la transferencia, solo la fecha -- se deja hora
        // en null en vez de rellenarla con la hora de llegada del correo (que podría no
        // coincidir con la de la transferencia misma).
        fecha: fechaM[3] + '-' + fechaM[2] + '-' + fechaM[1], hora: null,
        comercio: 'Transferencia a Movired',
        monto: montoCLP_(montoM[1]), tipo: 'gasto', medio_sugerido: 'cuenta_vista'
      };
    }
  },
  {
    id: 'banco_chile_transferencia_persona',
    // Plata que le transfiere OTRA PERSONA natural directo a su cuenta (ej. le devuelven algo,
    // le pagan su parte de un gasto) -- asunto propio y fijo ("Aviso de transferencia de
    // fondos"), distinto del de "Pago de tu corredor" (empresa, sin asunto fijo, cubierto por
    // banco_chile_transferencia_recibida) y del de "Transferencia a Terceros" (ella enviando,
    // cubierto por banco_chile_transferencia) -- se filtra por asunto para no cruzarse con
    // ninguna de esas dos.
    query: 'from:serviciodetransferencias@bancochile.cl subject:"Aviso de transferencia de fondos"',
    parse: function(bodyText){
      // Misma negrita-como-asteriscos de siempre en el nombre de quien envía ("*Javier Ignacio
      // Espinoza*").
      var t = bodyText.replace(/\*/g, '');
      var origenM = t.match(/nuestro\(a\)\s+cliente\s+(.+?)\s+ha efectuado/i);
      var montoM = t.match(/Monto\s*\$([\d.,]+)/i);
      // Mismo formato de fecha (día de la semana + fecha + hora) que banco_chile_transferencia.
      var fechaM = t.match(/Fecha\s+y\s+Hora:\s*\S+\s+(\d{1,2})\s+de\s+(\wé\w+|\w+)\s+de\s+(\d{4})\s+(\d{2}:\d{2})/i);
      if (!montoM || !fechaM) return null;
      var mesIdx = MESES.indexOf(fechaM[2].toLowerCase());
      if (mesIdx < 0) return null;
      return {
        fecha: fechaM[3] + '-' + pad2_(mesIdx + 1) + '-' + pad2_(fechaM[1]), hora: fechaM[4],
        comercio: 'Transferencia de ' + (origenM ? origenM[1].trim() : 'un tercero'),
        // Le llega a su cuenta corriente/vista, no a una tarjeta ni a efectivo.
        monto: montoCLP_(montoM[1]), tipo: 'ingreso', medio_sugerido: 'cuenta_vista'
      };
    }
  },
  {
    id: 'racional_orden',
    query: 'from:racional@racional.cl (subject:"Invertiste en" OR subject:"Vendiste")',
    // Este correo viene armado en una tabla HTML de dos columnas (vista compra / vista
    // venta) que la conversión automática a texto plano a veces desordena — por eso a esta
    // regla en particular se le pasa el HTML ya "pelado" (sin etiquetas) en vez del texto
    // plano de Gmail, que respeta mejor el orden real del contenido.
    bodyMode: 'html',
    parse: function(bodyText, subject){
      var esVenta = /^Vendiste/i.test(subject);
      var nombreM = subject.match(/^(?:Invertiste en|Vendiste)\s+(.+)$/i);
      var montoM = bodyText.match(/Monto (?:comprado|vendido)\s*US\$\s*([\d.,]+)/i);
      if (!montoM) return null;
      return {
        fecha: null, hora: null,
        comercio: (nombreM ? nombreM[1].trim() : 'Racional') + ' (USD)',
        monto: montoUSD_(montoM[1]),
        tipo: esVenta ? 'ingreso' : 'inversion',
        // Un aporte a Racional sale de tu cuenta (y una venta vuelve a ella) — no es efectivo
        // ni una compra con tarjeta.
        medio_sugerido: 'cuenta_vista'
      };
    }
  },
  {
    id: 'movired',
    query: 'from:comprobante@movired.cl subject:"Notificación de compra"',
    parse: function(bodyText){
      var montoM = bodyText.match(/Monto\s+pagado\s*\$?\s*([\d.,]+)/);
      var fechaM = bodyText.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}):\d{2}/);
      if (!montoM) return null;
      return {
        fecha: fechaM ? (fechaM[3] + '-' + fechaM[2] + '-' + fechaM[1]) : null,
        hora: fechaM ? fechaM[4] : null,
        comercio: 'Movired / bip!', monto: montoCLP_(montoM[1]), tipo: 'gasto', medio_sugerido: null
      };
    }
  }
];

// Varios bancos meten caracteres invisibles (zero-width) en sus correos para dificultar que
// un robot los lea automáticamente — por ejemplo el teléfono de contacto del Edwards llega
// como "60‍0 2‍31 99‍99" en vez de "600 231 9999". A simple vista el correo se ve normal,
// pero esos caracteres rompen cualquier patrón que busque el texto tal cual — por eso se
// sacan ANTES de aplicar cualquier regla de lectura.
function stripInvisibles_(s){
  return String(s).replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '');
}

function stripTags_(html){
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<(br|\/tr|\/td|\/p|\/div|\/th)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function callImportarTransaccion_(row, fuenteId, msgId){
  var url = SUPABASE_URL + '/rest/v1/rpc/importar_transaccion';
  var payload = {
    p_household_id: HOUSEHOLD_ID,
    p_token: IMPORT_TOKEN,
    p_fuente: 'gmail:' + fuenteId,
    p_fuente_msg_id: msgId,
    p_fecha: row.fecha,
    p_hora: row.hora,
    p_comercio: row.comercio,
    p_monto: row.monto,
    p_tipo: row.tipo,
    p_medio_sugerido: row.medio_sugerido || null,
    p_raw: null
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 300) {
    Logger.log('Error importando ' + fuenteId + ' (' + msgId + '): [' + code + '] ' + res.getContentText());
    return false;
  }
  Logger.log('OK ' + fuenteId + ' ' + row.fecha + ' $' + row.monto + ' — ' + row.comercio);
  return true;
}

// ---------- notificación push de "llegó una transacción nueva" ----------
// La base de datos ignora un correo repetido (on conflict do nothing), pero igual lo vuelve a
// intentar cada vez que corre (WINDOW_DAYS de margen) — así que si mandáramos el push cada vez
// que callImportarTransaccion_ responde "OK", ella recibiría el MISMO aviso repetido durante
// días. Para evitarlo, se guarda acá (en las propiedades del script, no en Supabase) qué
// mensajes ya gatillaron un push, y no se vuelve a avisar por el mismo mensaje dos veces.
function pushWorkerConfigurado_(){
  return typeof PUSH_WORKER_URL === 'string' && PUSH_WORKER_URL.indexOf('PEGA_AQUI') !== 0;
}
function yaSeNotificoPush_(msgId){
  return PropertiesService.getScriptProperties().getProperty('push_' + msgId) === '1';
}
function marcarNotificadoPush_(msgId){
  PropertiesService.getScriptProperties().setProperty('push_' + msgId, '1');
}
function formatearMonto_(row){
  var esUSD = /\(USD\)$/.test(row.comercio || '');
  var n = row.monto;
  if (esUSD) return 'US$ ' + n.toFixed(2);
  var entero = String(Math.round(n));
  var conPuntos = '';
  for (var i = 0; i < entero.length; i++) {
    if (i > 0 && (entero.length - i) % 3 === 0) conPuntos += '.';
    conPuntos += entero[i];
  }
  return '$' + conPuntos;
}
function notificarTransaccionNueva_(row){
  if (!pushWorkerConfigurado_()) return;
  var tipoLabel = row.tipo === 'ingreso' ? 'Ingreso' : row.tipo === 'inversion' ? 'Inversión' : 'Gasto';
  try {
    var res = UrlFetchApp.fetch(PUSH_WORKER_URL + '/notify', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        household_id: HOUSEHOLD_ID,
        token: IMPORT_TOKEN,
        title: tipoLabel + ' nuevo: ' + row.comercio,
        message: formatearMonto_(row),
        url: './index.html'
      }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) {
      Logger.log('Push: no se pudo notificar (' + res.getResponseCode() + '): ' + res.getContentText());
    }
  } catch (e) {
    Logger.log('Push: error de red notificando: ' + e);
  }
}

// ---------- cartola / estado de cuenta: se guarda el PDF adjunto tal cual llega ----------
// A diferencia de RULES (que lee el texto del correo), acá no se intenta entender el
// contenido — se manda el archivo completo, todavía con la clave puesta por el banco. La
// clave nunca se guarda ni se manda a ningún lado: se la vas a pedir la app, en tu navegador,
// recién cuando quieras usar ese PDF en "Reconciliar con la cartola".
var CARTOLA_RULES = [
  {
    id: 'cartola_cuenta_corriente',
    tipo: 'cuenta_corriente',
    query: 'from:bancoedwards.cl subject:"Cartola Cuenta Corriente"'
  },
  {
    id: 'estado_cuenta_tarjeta',
    tipo: 'tarjeta_nacional',
    query: 'from:bancoedwards.cl subject:"Estado de Cuenta Tarjeta de Crédito"'
  }
];
// Este correo llega una vez al mes por cuenta/tarjeta — con 40 días de margen alcanza de
// sobra aunque el script no haya corrido por un tiempo, y no hay riesgo de duplicados (la
// base de datos ignora cualquier correo que ya haya visto, por su id de Gmail).
var CARTOLA_WINDOW_DAYS = 40;

function callImportarCartola_(tipo, msgId, filename, bytes){
  var url = SUPABASE_URL + '/rest/v1/rpc/importar_cartola';
  var payload = {
    p_household_id: HOUSEHOLD_ID,
    p_token: IMPORT_TOKEN,
    p_tipo: tipo,
    p_fuente_msg_id: msgId,
    p_nombre_archivo: filename,
    p_contenido_base64: Utilities.base64Encode(bytes)
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 300) {
    Logger.log('Error guardando cartola (' + tipo + ', ' + msgId + '): [' + code + '] ' + res.getContentText());
  } else {
    Logger.log('OK cartola ' + tipo + ' — ' + filename + ' (' + msgId + ')');
  }
}

// GmailApp.search() filtra QUÉ THREADS califican con newer_than, pero thread.getMessages()
// después trae TODOS los mensajes de esos threads, sin importar su fecha -- si los correos de
// un banco se van acumulando en un mismo thread (pasa seguido cuando el asunto se repite igual,
// ej. "Compra con Tarjeta de Crédito"), cada corrida terminaba reprocesando el historial
// COMPLETO de ese thread, por viejo que fuera. Con un thread de cientos/miles de mensajes
// acumulados, eso arriesgaba pasarse del límite de 6 minutos que tiene una ejecución de Apps
// Script a mitad de camino, dejando afuera silenciosamente los correos más nuevos (sin ningún
// error visible en el log -- una ejecución cortada por tiempo no se reporta como falla). Este
// filtro por fecha, mensaje por mensaje, evita reprocesar ese historial viejo cada vez.
function mensajeEstaEnVentana_(message, dias){
  var corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  return message.getDate() >= corte;
}

function revisarCartolas(){
  CARTOLA_RULES.forEach(function(rule){
    var busqueda = rule.query + ' newer_than:' + CARTOLA_WINDOW_DAYS + 'd';
    var threads = GmailApp.search(busqueda, 0, 20);
    var mensajesEnVentana = [];
    threads.forEach(function(t){
      t.getMessages().forEach(function(m){ if (mensajeEstaEnVentana_(m, CARTOLA_WINDOW_DAYS)) mensajesEnVentana.push(m); });
    });
    Logger.log(rule.id + ' — búsqueda: [' + busqueda + '] — correos encontrados: ' + mensajesEnVentana.length);
    mensajesEnVentana.forEach(function(message){
        try {
          var attachments = message.getAttachments();
          if (!attachments.length) {
            Logger.log(rule.id + ' — correo sin adjunto (raro, revisar): ' + message.getId());
            return;
          }
          // Por si algún día viniera más de un adjunto en el mismo correo, se guardan todos
          // (cada uno con su propio id de adjunto agregado al id del mensaje, para no chocar).
          attachments.forEach(function(att, idx){
            var msgId = message.getId() + (attachments.length > 1 ? ':' + idx : '');
            callImportarCartola_(rule.tipo, msgId, att.getName(), att.getBytes());
          });
        } catch (e) {
          Logger.log('Error procesando cartola de ' + rule.id + ': ' + e);
        }
    });
  });
}

function revisarCorreos(){
  var tz = Session.getScriptTimeZone();
  RULES.forEach(function(rule){
    var busqueda = rule.query + ' newer_than:' + WINDOW_DAYS + 'd';
    var threads = GmailApp.search(busqueda, 0, 50);
    var mensajesEnVentana = [];
    threads.forEach(function(t){
      t.getMessages().forEach(function(m){ if (mensajeEstaEnVentana_(m, WINDOW_DAYS)) mensajesEnVentana.push(m); });
    });
    // Diagnóstico: esto te dice si el problema es la búsqueda (0 correos encontrados) o el
    // parseo (encontró correos pero no logró sacarles los datos) — antes esto quedaba mudo.
    Logger.log(rule.id + ' — búsqueda: [' + busqueda + '] — correos encontrados: ' + mensajesEnVentana.length);
    mensajesEnVentana.forEach(function(message){
        try {
          var rawBody = rule.bodyMode === 'html' ? stripTags_(message.getBody()) : message.getPlainBody();
          var bodyText = stripInvisibles_(rawBody);
          var subject = stripInvisibles_(message.getSubject());
          var parsed = rule.parse(bodyText, subject);
          if (!parsed) {
            // Antes había que ir a correr una función de debug aparte para ver esto -- ahora
            // el texto crudo queda directo en el log apenas falla, sin un paso extra.
            Logger.log(rule.id + ' — encontró el correo pero NO logró leer los datos (revisar el formato). Asunto: "' + subject + '"');
            Logger.log(rule.id + ' — cuerpo del correo que falló (saltos de línea y caracteres invisibles marcados):\n' + textoVisible_(rawBody));
            return;
          }
          if (!parsed.fecha) {
            var d = message.getDate();
            parsed.fecha = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
            parsed.hora = parsed.hora || Utilities.formatDate(d, tz, 'HH:mm');
          }
          var msgId = message.getId();
          var ok = callImportarTransaccion_(parsed, rule.id, msgId);
          if (ok && !yaSeNotificoPush_(msgId)) {
            notificarTransaccionNueva_(parsed);
            marcarNotificadoPush_(msgId);
          }
        } catch (e) {
          Logger.log('Error procesando mensaje de ' + rule.id + ': ' + e);
        }
    });
  });

  // Mismo trigger, un paso más: además de las transacciones sueltas de arriba, revisa el
  // correo mensual de cartola/estado de cuenta y guarda el PDF adjunto (sigue cifrado).
  revisarCartolas();
}

// Compartida por revisarCorreos() (cuando un correo "se encontró pero no se pudo leer") y
// las funciones de debug de más abajo -- deja ver el texto EXACTO tal como lo procesa el
// script (con saltos de línea y caracteres invisibles marcados), que no siempre es igual a
// lo que se ve al abrir el correo en el navegador.
function textoVisible_(body){
  return String(body)
    .replace(/\r\n|\r|\n/g, '[SALTO DE LINEA]\n')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '[INVISIBLE]');
}
// ---------- funciones de diagnóstico temporal — bórralas cuando ya no las necesites ----------
// Traen el texto de un correo puntual buscado a mano -- para diagnosticar UNO en particular sin
// esperar a que vuelva a fallar dentro de revisarCorreos() (que ahora también muestra el
// texto crudo automáticamente en el log cuando algo falla, ver más abajo -- esto ya es
// un respaldo más, no la única forma de diagnosticar).
function debugVerCuerpoCrudo_(query, etiqueta){
  var threads = GmailApp.search(query + ' newer_than:' + WINDOW_DAYS + 'd', 0, 1);
  if (!threads.length) { Logger.log(etiqueta + ' — no encontró ningún correo con esa búsqueda.'); return; }
  var msg = threads[0].getMessages()[threads[0].getMessages().length - 1];
  Logger.log('--- ' + etiqueta + ' — asunto ---\n' + msg.getSubject());
  Logger.log('--- ' + etiqueta + ' — cuerpo (saltos de línea y caracteres invisibles marcados) ---\n' + textoVisible_(msg.getPlainBody()));
}
// Para diagnosticar un correo que "encontró pero no logró leer" -- en el desplegable de
// arriba junto a "Ejecutar", elige la función del banco que está fallando y aprieta Ejecutar,
// después revisa el log (Ver > Registros). Pega ese texto tal cual para poder ajustar el
// regex a como realmente llega el correo (no como se ve al abrirlo en el navegador -- Gmail
// puede mostrar una cosa y guardar el texto plano distinto).
function debugVerCuerpoCrudoEdwards(){
  debugVerCuerpoCrudo_('from:enviodigital@bancoedwards.cl (subject:"Compra con Tarjeta de Crédito" OR subject:"Cargo en Cuenta")', 'Banco Edwards (compra)');
}
function debugVerCuerpoCrudoBancoChile(){
  debugVerCuerpoCrudo_('from:serviciodetransferencias@bancochile.cl subject:"Transferencia a Terceros"', 'Banco de Chile (transferencia)');
}
