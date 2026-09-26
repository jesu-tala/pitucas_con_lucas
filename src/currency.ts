/* ===================== USD -> CLP =====================
   La app guarda y calcula SIEMPRE en pesos: monto es CLP en todas las vistas (Balance,
   Evolución, Presupuesto, metas). Una compra en dólares se convierte al registrarla y quedan
   guardados los tres datos -- monto (CLP), montoOriginal (USD) y tipoCambio -- para que la
   conversión sea auditable y se pueda rehacer si alguna vez estuvo mal.

   Antes esto solo existía del lado del Apps Script del import por correo, y ahí la trazabilidad
   se guardaba PEGADA AL NOMBRE del comercio ("AMAZON (US$51.25 a $950)"): texto, no datos. Peor,
   si la consulta del tipo de cambio fallaba dejaba el monto EN DÓLARES dentro de un campo que
   toda la app suma como pesos, así que una compra de US$51 entraba al balance como $51. Acá no
   puede pasar: sin un tipo de cambio (de la API o escrito a mano) no hay conversión, y la UI no
   deja guardar en USD hasta tenerlo.

   mindicador.cl es la API pública del "dólar observado" del Banco Central. Responde con
   Access-Control-Allow-Origin:*, así que se consulta derecho desde el navegador -- no hace falta
   pasar por el Worker ni redesplegarlo. */

// El dólar observado se publica solo los días HÁBILES. Si la fecha pedida cae sábado, domingo o
// feriado, se retrocede día por día hasta encontrar el último valor publicado antes -- el mismo
// criterio que usa cualquier sistema contable (la compra del sábado usa el valor del viernes) y
// el mismo que ya usaba el Apps Script, para que las dos vías den el mismo número.
const MAX_DIAS_ATRAS = 7;

// Cache por fecha pedida. Registrar tres compras del mismo viaje no dispara tres consultas, y
// volver a abrir el formulario tampoco.
const cache: Record<string, number> = {};

export function tipoCambioCacheado(fechaISO: string): number | null {
  return Object.prototype.hasOwnProperty.call(cache, fechaISO) ? cache[fechaISO] : null;
}

function ddmmaaaa(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear();
}

// Devuelve el dólar observado para esa fecha, o null si no se pudo conseguir. NUNCA lanza: quien
// llama tiene que poder seguir y ofrecer el tipo de cambio a mano, porque no conseguir el valor
// jamás puede impedir registrar un gasto.
export async function tipoCambioUSDCLP(fechaISO: string): Promise<number | null> {
  if(Object.prototype.hasOwnProperty.call(cache, fechaISO)) return cache[fechaISO];
  // Mediodía, no medianoche: con medianoche el huso horario puede correr la fecha un día.
  const d = new Date(fechaISO + 'T12:00:00');
  if(isNaN(d.getTime())) return null;
  for(let intento = 0; intento < MAX_DIAS_ATRAS; intento++){
    try {
      const res = await fetch('https://mindicador.cl/api/dolar/' + ddmmaaaa(d));
      if(res.ok){
        const data = await res.json();
        const valor = data && data.serie && data.serie.length ? data.serie[0].valor : null;
        if(typeof valor === 'number' && valor > 0){
          cache[fechaISO] = valor;
          return valor;
        }
      }
    } catch(e){
      // Sin conexión, la API caída, el dominio bloqueado: todos son el mismo caso desde acá
      // (no hay valor), y todos terminan ofreciendo escribirlo a mano.
      console.warn('Pitucas sin lucas — no se pudo consultar el tipo de cambio:', String(e));
      return null;
    }
    d.setDate(d.getDate() - 1);
  }
  return null;
}

// La conversión, en un solo lugar. Redondea a peso entero porque es la unidad en que la app
// guarda y muestra todo -- dejar decimales haría que los totales no cuadraran con lo que se ve.
export function convertirUSDaCLP(montoUSD: number, tipoCambio: number): number {
  return Math.round((montoUSD || 0) * (tipoCambio || 0));
}
