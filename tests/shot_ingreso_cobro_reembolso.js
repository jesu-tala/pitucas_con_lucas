// Regresión: primero se sacó que la tarjeta "Cobros y reembolsos" apareciera cuando no había
// NINGÚN pendiente en toda la app -- pero la usuaria reportó después que igual seguía viendo la
// tarjeta en "Sueldo Agosto" (t6), que sí tiene categoría ("Sueldo"). La regla correcta: un
// ingreso YA categorizado (un sueldo, un freelance con su categoría puesta) nunca es candidato a
// ser el pago de un cobro o reembolso, así que la tarjeta nunca debe aparecer en él -- sin
// importar cuántos pendientes sueltos haya en otras transacciones. La tarjeta solo tiene sentido
// para un depósito SIN categoría (ambiguo, tipo "Transferencia de Fran"), que sí podría ser eso.
// Casos: (a) sin pendientes en la app -> oculta. (b) ingreso sin categoría + pendiente real en
// otro lado -> visible con el CTA de vincular. (c) ingreso ya vinculado -> visible con el banner,
// tenga o no categoría. (d) ingreso CON categoría (Sueldo Agosto) + pendiente real en otro lado
// -> sigue oculta (el caso que reportó la usuaria).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // t59 = Venta bicicleta (ingreso SIN categoría, sin vínculo) -- el candidato correcto para
  // ofrecer "vincular a un pendiente". t8 tiene el único pendiente sin pagar de toda la maqueta
  // (reembolso de Isapre) -- lo marcamos pagado para dejar la app sin NINGÚN pendiente real, y
  // así probar el caso "no debería aparecer la tarjeta".
  await page.evaluate(() => {
    const D = window.__debug;
    const t8 = D.TX.find(t => t.id === 't8');
    t8.porCobrar[0].pagado = true;
    D.render();
  });

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // (a) Sin ningún pendiente en toda la app y sin vínculo propio: la tarjeta no debe aparecer.
  await page.click('[data-tx="t59"]');
  await page.waitForTimeout(200);
  const sinPendientes = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Cobros y reembolsos'));
  check('(a) Ingreso sin categoría, sin vínculo y SIN pendientes en la app: no aparece "Cobros y reembolsos"', sinPendientes === false);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (b) Si vuelve a haber un pendiente real en algún lado (aunque sea de otra transacción), la
  // tarjeta SÍ debe aparecer en un ingreso SIN categoría, ofreciendo vincular.
  await page.evaluate(() => {
    const D = window.__debug;
    const t8 = D.TX.find(t => t.id === 't8');
    t8.porCobrar[0].pagado = false;
    D.render();
  });
  await page.click('[data-tx="t59"]');
  await page.waitForTimeout(200);
  const conPendienteGlobal = await page.evaluate(() => {
    const content = document.getElementById('sheet-content');
    return {
      tieneTarjeta: content.textContent.includes('Cobros y reembolsos'),
      tieneBotonVincular: !!document.querySelector('[data-open-link-ingreso="t59"]'),
    };
  });
  check('(b) Ingreso SIN categoría + pendiente real en otra transacción: SÍ aparece la tarjeta', conPendienteGlobal.tieneTarjeta === true, conPendienteGlobal);
  check('   con el botón para vincular (este ingreso no está vinculado)', conPendienteGlobal.tieneBotonVincular === true, conPendienteGlobal);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (d) El caso reportado por la usuaria: "Sueldo Agosto" (t6) SÍ tiene categoría ("Sueldo") --
  // aunque siga habiendo un pendiente real suelto en otra transacción (mismo estado que en (b)),
  // la tarjeta NO debe aparecer: un sueldo categorizado nunca es un cobro/reembolso.
  await page.click('[data-tx="t6"]');
  await page.waitForTimeout(200);
  const sueldoConPendienteSuelto = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Cobros y reembolsos'));
  check('(d) Ingreso CON categoría (Sueldo Agosto) + pendiente real suelto: NO aparece la tarjeta', sueldoConPendienteSuelto === false, sueldoConPendienteSuelto);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (c) Un ingreso YA vinculado (t72, vinculado desde t5) debe mostrar la tarjeta con el banner
  // de "Vinculado a...", incluso si luego no quedara ningún otro pendiente suelto.
  const yaVinculado = await page.evaluate(() => {
    const D = window.__debug;
    const t8 = D.TX.find(t => t.id === 't8');
    t8.porCobrar[0].pagado = true; // sin pendientes sueltos ahora
    D.render();
    return true;
  });
  check('(setup c) queda sin pendientes sueltos otra vez', yaVinculado === true);
  await page.click('[data-tx="t72"]');
  await page.waitForTimeout(200);
  const vinculado = await page.evaluate(() => ({
    tieneTarjeta: document.getElementById('sheet-content').textContent.includes('Cobros y reembolsos'),
    tieneBanner: document.getElementById('sheet-content').textContent.includes('Vinculado a'),
  }));
  check('(c) Un ingreso YA vinculado sigue mostrando la tarjeta (para ver/quitar el vínculo)', vinculado.tieneTarjeta === true, vinculado);
  check('   con el banner de "Vinculado a..."', vinculado.tieneBanner === true, vinculado);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
