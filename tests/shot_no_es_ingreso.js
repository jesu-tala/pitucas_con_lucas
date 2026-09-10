// Feature: "cuando recibo plata también debería estar la opción de no es ingreso" -- ya existía
// "No es gasto" para transacciones tipo gasto (ej. un traspaso entre sus propias cuentas que no
// debería contar como gasto real), pero no había nada equivalente para un ingreso (ej. un
// traspaso que le llega de su propia cuenta, o una devolución que no es plata "nueva" de
// verdad). Reusa el mismo estado 'no_es_gasto' -- monthTotals (views/evolucion.ts) ya excluye
// ese estado de los agregados de gasto/ingreso/inversión de forma genérica sin mirar t.tipo, así
// que solo hacía falta el botón y la etiqueta correctas para un ingreso.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.unshift({
      id: 'tx-ingreso-test', fecha: D.todayISO(), hora: '10:00', comercio: 'Traspaso desde mi otra cuenta',
      monto: 200000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'pololos_extra', monto: 200000 }], porCobrar: [], reglaAuto: false, nota: ''
    });
    D.state.tab = 'transacciones';
    D.render();
  });

  // ---------- El total de "Ingresos" del mes ANTES de marcarla ----------
  const antes = await page.evaluate(() => window.__debug.monthTotals(window.__debug.todayISO().slice(0, 7)).ingresos);

  // ---------- Abrir el detalle y confirmar que existe el botón "No es ingreso" ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.openTxId = 'tx-ingreso-test';
    D.state.creatingNew = false;
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  const boton = await page.evaluate(() => {
    const btn = document.querySelector('[data-action="noesgasto"]');
    return btn ? { existe: true, texto: btn.textContent.trim() } : { existe: false };
  });
  check('El detalle de un ingreso tiene un botón de acción rápida', boton.existe === true, boton);
  check('   con el texto "No es ingreso" (no "No es gasto")', /no es ingreso/i.test(boton.texto) && !/no es gasto/i.test(boton.texto), boton);

  // ---------- Tocarlo lo marca, le limpia la categoría, y lo saca de los totales de Ingresos ----------
  await page.click('[data-action="noesgasto"]');
  await page.waitForTimeout(150);
  const trasMarcar = await page.evaluate(() => {
    const D = window.__debug;
    const t = D.TRANSACTIONS.find(t => t.id === 'tx-ingreso-test');
    return {
      estado: t.estado, categorias: t.categorias.length,
      ingresosDelMes: D.monthTotals(D.todayISO().slice(0, 7)).ingresos,
      toast: document.getElementById('toast-stack').textContent,
    };
  });
  check('Tocar "No es ingreso" marca estado no_es_gasto y limpia la categoría', trasMarcar.estado === 'no_es_gasto' && trasMarcar.categorias === 0, trasMarcar);
  check('   avisando con el toast correcto ("Marcado como no es ingreso")', /marcado como no es ingreso/i.test(trasMarcar.toast), trasMarcar);
  check('   y queda excluida del total de "Ingresos" del mes (monthTotals)', trasMarcar.ingresosDelMes === antes - 200000, { antes, despues: trasMarcar.ingresosDelMes });

  // ---------- En la lista de Transacciones, muestra el badge "No es ingreso" ----------
  await page.evaluate(() => { document.getElementById('sheet-overlay').classList.remove('open'); window.__debug.state.openTxId = null; window.__debug.render(); });
  await page.waitForTimeout(150);
  const enLista = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.tx-item')).find(i => i.textContent.includes('Traspaso desde mi otra cuenta'));
    return item ? item.textContent : null;
  });
  check('En la lista, la fila muestra el badge "No es ingreso"', enLista && enLista.includes('No es ingreso'), enLista);

  // ---------- Se puede desmarcar de nuevo ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.openTxId = 'tx-ingreso-test';
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-action="noesgasto"]');
  await page.waitForTimeout(150);
  const trasDesmarcar = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 'tx-ingreso-test').estado);
  check('Se puede desmarcar "No es ingreso" de nuevo', trasDesmarcar !== 'no_es_gasto', trasDesmarcar);

  await finish({ context, browser, errors });
})();
