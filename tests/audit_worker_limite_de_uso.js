// Guarda el tope de uso del Cloudflare Worker (backend/cloudflare-worker/worker.js).
//
// El riesgo: los dos endpoints se autentican con household_id + import_token, un secreto de larga
// vida que se reusa siempre. Si se filtra, quien lo tenga podía llamar /leer-boleta en bucle, y
// cada llamada gasta cuota PAGA de Gemini -- el daño es la cuenta de la tarjeta, no los datos.
//
// El Worker no se puede ejercitar desde esta suite (es otro despliegue, no parte de la app), así
// que lo que se vigila acá es el ORDEN de las defensas dentro del archivo, que es exactamente lo
// que puede romperse sin que nadie lo note: que nunca se llame (ni se pague) a Gemini antes de
// haber validado el hogar y descontado la cuota. Un reordenamiento inocente al agregar una
// función nueva dejaría el agujero abierto de nuevo, en silencio.
const fs = require('fs');
const path = require('path');
const { check, finish } = require('./lib/test_kit');

const WORKER = fs.readFileSync(path.join(__dirname, '..', 'backend', 'cloudflare-worker', 'worker.js'), 'utf-8');

function cuerpoDe(nombre) {
  const inicio = WORKER.indexOf('async function ' + nombre);
  if (inicio === -1) return null;
  const siguiente = WORKER.indexOf('\nasync function ', inicio + 10);
  const fin = siguiente === -1 ? WORKER.indexOf('\nexport default', inicio) : siguiente;
  return WORKER.slice(inicio, fin === -1 ? WORKER.length : fin);
}

const leerBoleta = cuerpoDe('handleLeerBoleta_');
const notify = cuerpoDe('handleNotify_');

// Control positivo: si el test no encuentra los handlers, no puede afirmar nada -- sin esto
// pasaría en verde por no haber revisado nada.
check('(control) se encuentran los dos handlers en worker.js', !!leerBoleta && !!notify, { leerBoleta: !!leerBoleta, notify: !!notify });

if (leerBoleta) {
  const posTamano = leerBoleta.indexOf('MAX_IMAGE_BASE64_CHARS');
  const posValida = leerBoleta.indexOf("verificar_household");
  const posCuota = leerBoleta.indexOf('dentroDeLaCuota_');
  const posGemini = leerBoleta.indexOf('llamarGemini_');

  check('/leer-boleta rechaza imágenes demasiado grandes', posTamano !== -1, posTamano);
  check('/leer-boleta descuenta cuota por hogar', posCuota !== -1, posCuota);
  check('/leer-boleta valida el hogar ANTES de descontar cuota (un token inválido no gasta la cuota ajena)',
    posValida !== -1 && posCuota !== -1 && posValida < posCuota, { posValida, posCuota });
  check('/leer-boleta descuenta cuota ANTES de llamar a Gemini (que es lo que cuesta plata)',
    posCuota !== -1 && posGemini !== -1 && posCuota < posGemini, { posCuota, posGemini });
  check('/leer-boleta rechaza por tamaño ANTES de llamar a Gemini', posTamano !== -1 && posGemini !== -1 && posTamano < posGemini, { posTamano, posGemini });
}

if (notify) {
  check('/notify también descuenta cuota por hogar', notify.indexOf('dentroDeLaCuota_') !== -1);
}

// El contador tiene que seguir funcionando SIN configurar nada en Cloudflare: si algún día se
// reescribe para exigir el binding de KV, un Worker ya desplegado (que no lo tiene) se quedaría
// sin límite o, peor, devolviendo error en cada llamada.
const limitador = WORKER.slice(WORKER.indexOf('async function dentroDeLaCuota_'));
check('el contador funciona aunque no exista el KV (cae a memoria, no falla ni bloquea)',
  /if \(env\.RATE_LIMIT_KV\)/.test(limitador) && /cuotaEnMemoria_/.test(limitador), null);
check('si KV falla en caliente, no deja el servicio caído (hay try/catch con salida a memoria)',
  /catch \(e\)/.test(limitador), null);

finish();
