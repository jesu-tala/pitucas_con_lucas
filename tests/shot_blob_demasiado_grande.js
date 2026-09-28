// El techo al tamaño del blob, por el lado del cliente (ver
// backend/supabase/fix_limite_tamano_blob.sql y MAX_BYTES_BLOB en src/supabase.ts).
//
// El límite real lo aplica un trigger en la base. Lo que se ejercita acá son las dos piezas
// del cliente que pueden fallar en silencio: la medición del tamaño, y el aviso en pantalla.
//
// La medición importa más de lo que parece. El .length de JavaScript cuenta unidades UTF-16,
// no bytes, y el blob está lleno de acentos y eñes -- medir mal dejaría pasar blobs por encima
// del techo, que la base después rechaza, dejando a la persona sin poder guardar y sin
// entender por qué. Hay además un camino rápido que evita recorrer el string entero en cada
// guardado, y ese atajo es exactamente donde un error de este tipo se esconde.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    const MAX = D.MAX_BYTES_BLOB;
    const bytesReales = (t) => new TextEncoder().encode(t).length;

    // Un texto corto con acentos: cae en el camino rápido.
    const corto = 'ñandú café señor';
    // Un texto largo hecho de caracteres de 3 bytes en UTF-8 (rango U+0800–U+FFFF), que es el
    // peor caso posible. Se elige un largo justo por encima del umbral del camino rápido para
    // forzar la cuenta exacta.
    const largo3b = '漢'.repeat(Math.ceil(MAX / 3) + 1000);
    // Y uno claramente por encima del techo.
    const enorme = 'a'.repeat(MAX + 500);

    return {
      MAX,
      cortoMedido: D.bytesDe(corto),
      cortoReal: bytesReales(corto),
      largoMedido: D.bytesDe(largo3b),
      largoReal: bytesReales(largo3b),
      largoUtf16: largo3b.length,
      enormeMedido: D.bytesDe(enorme),
      enormeReal: bytesReales(enorme),
    };
  });

  check('(control) el techo llegó al navegador', r.MAX === 2097152, r);

  // El camino rápido puede contar de menos, pero NUNCA puede dejar pasar algo que no quepa:
  // por debajo del umbral, ni el peor caso de UTF-8 alcanza el techo.
  check('el camino rápido nunca subestima por encima del techo', r.cortoMedido <= r.MAX, r);

  // El caso que importa: un texto de 3 bytes por carácter, por encima del umbral del camino
  // rápido. Con un umbral mal elegido (la mitad en vez de un tercio) esto se medía como si
  // cupiera, y pasaba un blob de hasta 1,5 veces el techo.
  check('(control) el texto de prueba pesa más bytes que unidades UTF-16', r.largoReal > r.largoUtf16, r);
  check('un texto de 3 bytes por carácter se mide exacto', r.largoMedido === r.largoReal, r);
  check('ese texto se detecta por encima del techo', r.largoMedido > r.MAX, r);

  check('un texto claramente más grande que el techo se mide exacto', r.enormeMedido === r.enormeReal, r);
  check('y se detecta por encima del techo', r.enormeMedido > r.MAX, r);

  // ---------- el aviso en pantalla ----------
  const avisos = await page.evaluate(() => {
    const D = window.__debug;
    const el = document.getElementById('sync-indicator');
    D.updateSyncIndicator('demasiado-grande');
    const grande = { texto: el.textContent, oculto: el.hidden, error: el.classList.contains('error') };
    D.updateSyncIndicator('error');
    const red = { texto: el.textContent, oculto: el.hidden };
    D.updateSyncIndicator('saved');
    const ok = { oculto: el.hidden };
    return { grande, red, ok };
  });

  check('el aviso de "no cabe" se muestra', avisos.grande.oculto === false && !!avisos.grande.texto, avisos);
  check('el aviso de "no cabe" se ve como error', avisos.grande.error === true, avisos);
  // Decir "sin conexión" acá mandaría a revisar el wifi por algo que esperar no arregla.
  check('el aviso de "no cabe" NO dice sin conexión', !/[Ss]in conexión/.test(avisos.grande.texto), avisos);
  check('el aviso de "no cabe" explica qué hacer', /no caben/i.test(avisos.grande.texto), avisos);
  check('(control) el aviso de red sigue diciendo sin conexión', /[Ss]in conexión/.test(avisos.red.texto), avisos);
  check('(control) al guardar bien, el indicador se esconde', avisos.ok.oculto === true, avisos);

  await browser.close();
  finish(errors);
})();
