// Regression: it was first fixed so the "Cobros y reembolsos" card would appear when there was
// NO pending item anywhere in the app -- but the user later reported she was still seeing the
// card on "Sueldo Agosto" (t6), which does have a category ("Sueldo"). The correct rule: an
// income ALREADY categorized (a salary, a freelance job with its category set) is never a candidate
// to be the payment for a charge or refund, so the card must never appear on it -- no
// matter how many loose pending items exist on other transactions. The card only makes sense
// for a deposit WITHOUT a category (ambiguous, like "Transferencia de Fran"), which could actually be that.
// Cases: (a) no pending items in the app -> hidden. (b) uncategorized income + a real pending item
// elsewhere -> visible with the link CTA. (c) already-linked income -> visible with the banner,
// whether it has a category or not. (d) income WITH a category (Sueldo Agosto) + a real pending item
// elsewhere -> stays hidden (the case the user reported).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // t59 = Venta bicicleta (income WITHOUT a category, unlinked) -- the correct candidate to
  // offer "link to a pending item". t8 has the only unpaid pending item in the whole fixture
  // (Isapre refund) -- we mark it paid to leave the app with NO real pending item, so
  // we can test the "the card shouldn't appear" case.
  await page.evaluate(() => {
    const D = window.__debug;
    const t8 = D.TRANSACTIONS.find(t => t.id === 't8');
    t8.porCobrar[0].pagado = true;
    D.render();
  });

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // (a) With no pending item anywhere in the app and no link of its own: the card must not appear.
  await page.click('[data-tx="t59"]');
  await page.waitForTimeout(200);
  const sinPendientes = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Cobros y reembolsos'));
  check('(a) Ingreso sin categoría, sin vínculo y SIN pendientes en la app: no aparece "Cobros y reembolsos"', sinPendientes === false);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (b) If a real pending item exists again somewhere (even on another transaction), the
  // card SHOULD appear on an uncategorized income, offering to link.
  await page.evaluate(() => {
    const D = window.__debug;
    const t8 = D.TRANSACTIONS.find(t => t.id === 't8');
    t8.porCobrar[0].pagado = false;
    D.render();
  });
  await page.click('[data-tx="t59"]');
  await page.waitForTimeout(200);
  const conPendienteGlobal = await page.evaluate(() => {
    const content = document.getElementById('sheet-content');
    return {
      tieneTarjeta: content.textContent.includes('Cobros y reembolsos'),
      tieneBotonVincular: !!document.querySelector('[data-open-link-income="t59"]'),
    };
  });
  check('(b) Ingreso SIN categoría + pendiente real en otra transacción: SÍ aparece la tarjeta', conPendienteGlobal.tieneTarjeta === true, conPendienteGlobal);
  check('   con el botón para vincular (este ingreso no está vinculado)', conPendienteGlobal.tieneBotonVincular === true, conPendienteGlobal);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (d) The case the user reported: "Sueldo Agosto" (t6) DOES have a category ("Sueldo") --
  // even though a real loose pending item still exists on another transaction (same state as in (b)),
  // the card must NOT appear: a categorized salary is never a charge/refund.
  await page.click('[data-tx="t6"]');
  await page.waitForTimeout(200);
  const sueldoConPendienteSuelto = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Cobros y reembolsos'));
  check('(d) Ingreso CON categoría (Sueldo Agosto) + pendiente real suelto: NO aparece la tarjeta', sueldoConPendienteSuelto === false, sueldoConPendienteSuelto);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (c) An income ALREADY linked (t72, linked from t5) must show the card with the
  // "Vinculado a..." banner, even if no other loose pending item remained afterward.
  const yaVinculado = await page.evaluate(() => {
    const D = window.__debug;
    const t8 = D.TRANSACTIONS.find(t => t.id === 't8');
    t8.porCobrar[0].pagado = true; // no loose pending items now
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
