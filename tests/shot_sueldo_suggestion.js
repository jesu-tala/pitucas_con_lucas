const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Before touching anything: "this month" must have a salary registered (the banner
  // shouldn't show). The demo data has FIXED dates (e.g. salary dated 2026-08-25), so
  // as real months pass they stop falling in "the current month" -- instead of assuming
  // the demo already covers it, we make sure ourselves, adding one if needed.
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(150);
  const setupInfo = await page.evaluate(() => {
    const D = window.__debug;
    const ym = D.todayISO().slice(0,7);
    const yaHaySueldo = D.TRANSACTIONS.some(t => t.fecha.slice(0,7) === ym && t.categorias.some(c => c.cat === 'sueldo'));
    if (!yaHaySueldo) {
      D.TRANSACTIONS.push({ id: 't_sueldo_este_mes_test', fecha: ym + '-05', hora: '09:00', comercio: 'Sueldo Test',
        monto: 1000000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado',
        categorias: [{ cat: 'sueldo', monto: 1000000 }], porCobrar: [], reglaAuto: false, nota: '' });
    }
    D.render();
    return { ym, seAgrego: !yaHaySueldo };
  });
  console.log('Setup (sueldo del mes actual asegurado para el test):', JSON.stringify(setupInfo));
  const bannerAntes = await page.evaluate(() => !!document.querySelector('.sueldo-suggestion'));
  check('Con el sueldo de este mes ya registrado, el banner NO aparece', bannerAntes === false, bannerAntes);

  // Now we remove that salary from the current month (simulating it hasn't arrived yet) and re-render.
  const removed = await page.evaluate(() => {
    const D = window.__debug;
    const ym = D.todayISO().slice(0,7);
    const before = D.TRANSACTIONS.length;
    // We mutate the array IN PLACE (splice), we don't reassign it — window.__debug.TRANSACTIONS is a
    // reference captured once when the page loads; reassigning it (TRANSACTIONS = TRANSACTIONS.filter(...))
    // would leave it pointing at a stale array, not reflecting the real change (a known bug
    // in this test harness).
    for(let i=D.TRANSACTIONS.length-1;i>=0;i--){
      const t = D.TRANSACTIONS[i];
      if(t.fecha.slice(0,7)===ym && t.categorias.some(c=>c.cat==='sueldo')) D.TRANSACTIONS.splice(i,1);
    }
    D.render();
    return before - D.TRANSACTIONS.length;
  });
  await page.waitForTimeout(150);
  console.log('Se sacó el sueldo del mes actual (transacciones eliminadas):', removed);

  const bannerDespues = await page.evaluate(() => {
    const el = document.querySelector('.sueldo-suggestion');
    return el ? el.textContent : null;
  });
  check('Ahora SÍ aparece el banner de sugerencia', bannerDespues !== null, bannerDespues);

  // Pressing "Confirm or adjust" should open the new-transaction sheet, pre-filled with the
  // amount/method/category of the last registered salary (July's, in this case).
  const lastSueldoAntes = await page.evaluate(() => {
    const D = window.__debug;
    return D.lastSalaryTx();
  });
  await page.click('[data-confirm-salary-suggestion]');
  await page.waitForTimeout(250);
  const draft = await page.evaluate(() => window.__debug.state.draftTx);
  console.log('Draft pre-llenado:', JSON.stringify(draft));
  check('tipo=ingreso', draft.tipo === 'ingreso');
  check('monto = último sueldo', draft.monto === (lastSueldoAntes && lastSueldoAntes.monto), { draftMonto: draft.monto, lastSueldoAntes });
  check('categoría = sueldo', draft.categorias.some(c => c.cat === 'sueldo'), draft.categorias);
  check('comercio menciona "Sueldo"', /sueldo/i.test(draft.comercio), draft.comercio);

  // Save that pre-filled transaction and verify the banner disappears.
  const saveBtn = await page.$('[data-save-draft]');
  check('Existe el botón "Guardar transacción" en el sheet', saveBtn !== null);
  if (saveBtn) {
    await page.click('[data-save-draft]');
    await page.waitForTimeout(250);
    const bannerFinal = await page.evaluate(() => !!document.querySelector('.sueldo-suggestion'));
    check('Tras guardar, el banner desaparece', bannerFinal === false, bannerFinal);
  }

  // Also test the "Not yet" button: it should hide the banner without adding anything.
  await page.evaluate(() => {
    const D = window.__debug;
    const ym = D.todayISO().slice(0,7);
    for(let i=D.TRANSACTIONS.length-1;i>=0;i--){
      const t = D.TRANSACTIONS[i];
      if(t.fecha.slice(0,7)===ym && t.categorias.some(c=>c.cat==='sueldo')) D.TRANSACTIONS.splice(i,1);
    }
    D.state.salaryBannerDismissedMonth = null;
    D.render();
  });
  await page.waitForTimeout(150);
  const countBefore = await page.evaluate(() => window.__debug.TRANSACTIONS.length);
  await page.click('[data-dismiss-salary-suggestion]');
  await page.waitForTimeout(150);
  const bannerTrasDismiss = await page.evaluate(() => !!document.querySelector('.sueldo-suggestion'));
  const countAfter = await page.evaluate(() => window.__debug.TRANSACTIONS.length);
  check('Tras "Todavía no": banner desaparece', bannerTrasDismiss === false, bannerTrasDismiss);
  check('Tras "Todavía no": no se agregó nada', countAfter === countBefore, { countBefore, countAfter });

  await finish({ context, browser, errors });
})();
