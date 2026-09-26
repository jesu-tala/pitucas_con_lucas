// Una compra en dólares no se convertía a pesos. La conversión existía SOLO en el Apps Script del
// import por correo (mindicador.cl), no en la app: Transaction tenía monto y nada más, así que al
// registrarla a mano escribías 51 y quedaban $51 pesos.
//
// Y del lado que sí existía había dos problemas propios: la trazabilidad se guardaba pegada al
// nombre del comercio ("AMAZON (US$51.25 a $950)") en vez de como datos, y si la API no respondía
// dejaba el monto EN DÓLARES dentro de un campo que toda la app suma como pesos -- una compra de
// US$51 entraba al balance como $51, mil veces menos, avisando solo con texto en el nombre.
//
// Ahora la app convierte al dólar observado del DÍA DE LA COMPRA y guarda los tres datos: monto
// (CLP), montoOriginal (USD) y tipoCambio. monto está siempre en pesos, así que ninguna vista
// necesita saber de esto. Y sin tipo de cambio no se puede guardar: o lo da la API, o se escribe
// a mano, pero nunca entra un número en dólares a un campo que se suma como pesos.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // La API se simula: la suite no tiene red, y además así el test no depende del valor real del
  // dólar de hoy (que cambia todos los días y haría fallar el test solo por eso).
  await page.evaluate(() => {
    window.__fetchLlamadas = [];
    window.__fetchDebeFallar = false;
    window.fetch = function (url) {
      window.__fetchLlamadas.push(String(url));
      if (window.__fetchDebeFallar) return Promise.reject(new Error('sin red'));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ serie: [{ fecha: '2026-09-25T03:00:00.000Z', valor: 965.71 }] })
      });
    };
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.state.tab = 'transacciones'; D.render();
  });

  const abrirNueva = async () => { await page.click('#fab-add'); await page.waitForTimeout(300); };
  const escribir = async (sel, txt) => { await page.fill(sel, txt); await page.waitForTimeout(250); };

  // ---------- 1) En pesos, nada cambia ----------
  await abrirNueva();
  await escribir('[data-draft-field="comercio"]', 'Jumbo');
  await escribir('[data-draft-field="monto"]', '15000');
  const enPesos = await page.evaluate(() => ({
    monto: window.__debug.state.draftTx.monto,
    moneda: window.__debug.state.draftTx.moneda,
    haySelector: !!document.querySelector('[data-draft-moneda]')
  }));
  check('(control) el selector de moneda existe en el formulario', enPesos.haySelector === true, enPesos);
  check('una compra en pesos sigue funcionando igual que siempre', enPesos.monto === 15000 && enPesos.moneda === 'CLP', enPesos);

  // ---------- 2) En dólares: convierte al dólar del día de la compra ----------
  await page.click('[data-draft-moneda="USD"]');
  await page.waitForTimeout(400);
  await escribir('[data-draft-field="comercio"]', 'Amazon');
  // La fecha se cambia por el campo de verdad, no tocando el estado: es el handler de la fecha el
  // que invalida el tipo de cambio anterior y pide el del día nuevo. Escribiéndolo por detrás, el
  // test se saltaba justo esa parte y se quedaba con el valor cacheado de otro día.
  await escribir('[data-draft-field="fecha"]', '2026-09-25');
  await escribir('[data-draft-field="monto"]', '51,25');

  const enUSD = await page.evaluate(() => {
    const d = window.__debug.state.draftTx;
    return { monto: d.monto, montoOriginal: d.montoOriginal, tipoCambio: d.tipoCambio,
             texto: document.getElementById('sheet-content').textContent,
             urls: window.__fetchLlamadas.slice() };
  });
  check('en dólares se consulta el dólar observado de la fecha de la compra, no el de hoy',
    enUSD.urls.some(u => /mindicador\.cl\/api\/dolar\/\d{2}-\d{2}-\d{4}/.test(u)), enUSD.urls);
  check('el monto queda convertido a pesos (51,25 × 965,71 = 49.493)', enUSD.monto === 49493, enUSD);
  check('   y se guarda el monto original en dólares', enUSD.montoOriginal === 51.25, enUSD);
  check('   y el tipo de cambio usado', enUSD.tipoCambio === 965.71, enUSD);
  check('   la pantalla muestra la conversión, no solo el número final', /US\$51,25/.test(enUSD.texto) && /49\.493/.test(enUSD.texto), enUSD.texto.slice(0, 300));

  // ---------- 3) Al guardar, los tres datos viajan con la transacción ----------
  await page.click('[data-save-draft]');
  await page.waitForTimeout(400);
  const guardada = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(x => x.comercio === 'Amazon');
    return t ? { monto: t.monto, moneda: t.moneda, montoOriginal: t.montoOriginal, tipoCambio: t.tipoCambio } : null;
  });
  check('la transacción guardada queda en pesos, con la trazabilidad completa',
    !!guardada && guardada.monto === 49493 && guardada.moneda === 'USD' &&
    guardada.montoOriginal === 51.25 && guardada.tipoCambio === 965.71, guardada);

  // ---------- 4) Los totales usan los pesos, no los dólares ----------
  const totales = await page.evaluate(() => {
    const D = window.__debug;
    const t = D.TRANSACTIONS.find(x => x.comercio === 'Amazon');
    t.categorias = [{ cat: 'supermercado', monto: t.monto }];
    t.estado = 'confirmado';
    return { gastosDelMes: D.monthTotals(t.fecha.slice(0, 7)).gastos, montoTx: t.monto };
  });
  check('los totales suman los pesos convertidos, nunca los dólares crudos',
    totales.gastosDelMes === totales.montoTx && totales.gastosDelMes === 49493, totales);

  // ---------- 5) Si la API falla, se escribe a mano y NO se bloquea el registro ----------
  await page.evaluate(() => { window.__fetchDebeFallar = true; });
  await abrirNueva();
  await escribir('[data-draft-field="comercio"]', 'Hotel');
  await page.click('[data-draft-moneda="USD"]');
  await page.waitForTimeout(400);
  await escribir('[data-draft-field="fecha"]', '2026-09-18');
  await escribir('[data-draft-field="monto"]', '100');

  const sinApi = await page.evaluate(() => ({
    hayCampoManual: !!document.querySelector('[data-draft-tipocambio]'),
    texto: document.getElementById('sheet-content').textContent,
    guardarDeshabilitado: (document.querySelector('[data-save-draft]') || {}).disabled
  }));
  check('si la API no responde, ofrece escribir el tipo de cambio a mano', sinApi.hayCampoManual === true, sinApi);
  check('   y NO deja guardar un número en dólares como si fueran pesos (ese era el bug original)',
    sinApi.guardarDeshabilitado === true, sinApi);

  await escribir('[data-draft-tipocambio]', '900');
  const conManual = await page.evaluate(() => {
    const d = window.__debug.state.draftTx;
    return { monto: d.monto, tipoCambio: d.tipoCambio, guardarDeshabilitado: (document.querySelector('[data-save-draft]') || {}).disabled };
  });
  check('con el tipo de cambio a mano, convierte igual (100 × 900 = 90.000)',
    conManual.monto === 90000 && conManual.tipoCambio === 900, conManual);
  check('   y el registro deja de estar bloqueado (la API caída no impide anotar el gasto)',
    conManual.guardarDeshabilitado === false, conManual);

  // ---------- 6) Escribir en dólares no puede sacarle el foco al campo ----------
  // Bug reportado desde el teléfono: "cada vez que aprieto se cierra el teclado". La línea de
  // conversión se actualizaba llamando a renderSheet() en cada tecla, lo que recreaba el input;
  // al perder el foco, el teclado del teléfono se cierra y hay que volver a tocar el campo para
  // escribir el dígito siguiente. Ahora se reescribe solo el texto de la conversión.
  await page.evaluate(() => { window.__fetchDebeFallar = false; });
  await page.keyboard.press('Escape');   // la hoja del paso anterior sigue abierta y tapa el botón +
  await page.waitForTimeout(300);
  await abrirNueva();
  await page.click('[data-draft-moneda="USD"]');
  await page.waitForTimeout(400);
  await page.focus('[data-draft-field="monto"]');
  const foco = [];
  for(const ch of ['1','2','3','4']){
    await page.keyboard.type(ch);
    await page.waitForTimeout(120);
    foco.push(await page.evaluate(() => {
      const a = document.activeElement;
      return !!(a && a.getAttribute && a.getAttribute('data-draft-field') === 'monto');
    }));
  }
  check('escribir el monto en dólares NO le saca el foco al campo (el teclado no se cierra)',
    foco.every(Boolean), foco);
  const trasEscribir = await page.evaluate(() => ({
    valor: document.querySelector('[data-draft-field="monto"]').value,
    conversion: (document.querySelector('[data-conversion]') || {}).textContent || ''
  }));
  check('   y la conversión igual se actualiza mientras se escribe',
    /=/.test(trasEscribir.conversion) && trasEscribir.valor.length > 0, trasEscribir);

  await finish({ context, browser, errors });
})();
