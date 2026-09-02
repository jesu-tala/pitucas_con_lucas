const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Antes de tocar nada: "este mes" debe tener un sueldo registrado (el banner no debería
  // verse). Los datos de demo tienen fechas FIJAS (p.ej. sueldo fechado 2026-08-25), así que
  // con el paso de los meses reales dejan de caer en "el mes actual" -- en vez de asumir que
  // el demo ya lo cubre, nos aseguramos nosotros mismos, agregando uno si hace falta.
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(150);
  const setupInfo = await page.evaluate(() => {
    const D = window.__debug;
    const ym = D.todayISO().slice(0,7);
    const yaHaySueldo = D.TX.some(t => t.fecha.slice(0,7) === ym && t.categorias.some(c => c.cat === 'sueldo'));
    if (!yaHaySueldo) {
      D.TX.push({ id: 't_sueldo_este_mes_test', fecha: ym + '-05', hora: '09:00', comercio: 'Sueldo Test',
        monto: 1000000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado',
        categorias: [{ cat: 'sueldo', monto: 1000000 }], porCobrar: [], reglaAuto: false, nota: '' });
    }
    D.render();
    return { ym, seAgrego: !yaHaySueldo };
  });
  console.log('Setup (sueldo del mes actual asegurado para el test):', JSON.stringify(setupInfo));
  const bannerAntes = await page.evaluate(() => !!document.querySelector('.sueldo-suggestion'));
  check('Con el sueldo de este mes ya registrado, el banner NO aparece', bannerAntes === false, bannerAntes);

  // Ahora sacamos ese sueldo del mes actual (simulando que aún no llega) y re-renderizamos.
  const removed = await page.evaluate(() => {
    const D = window.__debug;
    const ym = D.todayISO().slice(0,7);
    const before = D.TX.length;
    // Mutamos el arreglo EN EL LUGAR (splice), no lo reasignamos — window.__debug.TX es una
    // referencia capturada una sola vez al cargar la página; reasignarla (TX = TX.filter(...))
    // la dejaría apuntando a un arreglo viejo, sin reflejar el cambio real (bug ya conocido
    // de este arnés de pruebas).
    for(let i=D.TX.length-1;i>=0;i--){
      const t = D.TX[i];
      if(t.fecha.slice(0,7)===ym && t.categorias.some(c=>c.cat==='sueldo')) D.TX.splice(i,1);
    }
    D.render();
    return before - D.TX.length;
  });
  await page.waitForTimeout(150);
  console.log('Se sacó el sueldo del mes actual (transacciones eliminadas):', removed);

  const bannerDespues = await page.evaluate(() => {
    const el = document.querySelector('.sueldo-suggestion');
    return el ? el.textContent : null;
  });
  check('Ahora SÍ aparece el banner de sugerencia', bannerDespues !== null, bannerDespues);

  // Apretar "Confirmar o ajustar" debe abrir la hoja de nueva transacción, pre-llena con el
  // monto/medio/categoría del último sueldo registrado (el de julio, en este caso).
  const lastSueldoAntes = await page.evaluate(() => {
    const D = window.__debug;
    return D.lastSueldoTx();
  });
  await page.click('[data-confirm-sueldo-suggestion]');
  await page.waitForTimeout(250);
  const draft = await page.evaluate(() => window.__debug.state.draftTx);
  console.log('Draft pre-llenado:', JSON.stringify(draft));
  check('tipo=ingreso', draft.tipo === 'ingreso');
  check('monto = último sueldo', draft.monto === (lastSueldoAntes && lastSueldoAntes.monto), { draftMonto: draft.monto, lastSueldoAntes });
  check('categoría = sueldo', draft.categorias.some(c => c.cat === 'sueldo'), draft.categorias);
  check('comercio menciona "Sueldo"', /sueldo/i.test(draft.comercio), draft.comercio);

  // Guardar esa transacción pre-llena y verificar que el banner desaparece.
  const saveBtn = await page.$('[data-save-draft]');
  check('Existe el botón "Guardar transacción" en el sheet', saveBtn !== null);
  if (saveBtn) {
    await page.click('[data-save-draft]');
    await page.waitForTimeout(250);
    const bannerFinal = await page.evaluate(() => !!document.querySelector('.sueldo-suggestion'));
    check('Tras guardar, el banner desaparece', bannerFinal === false, bannerFinal);
  }

  // Probar también el botón "Todavía no": debe ocultar el banner sin agregar nada.
  await page.evaluate(() => {
    const D = window.__debug;
    const ym = D.todayISO().slice(0,7);
    for(let i=D.TX.length-1;i>=0;i--){
      const t = D.TX[i];
      if(t.fecha.slice(0,7)===ym && t.categorias.some(c=>c.cat==='sueldo')) D.TX.splice(i,1);
    }
    D.state.sueldoBannerDescartadoMes = null;
    D.render();
  });
  await page.waitForTimeout(150);
  const countBefore = await page.evaluate(() => window.__debug.TX.length);
  await page.click('[data-dismiss-sueldo-suggestion]');
  await page.waitForTimeout(150);
  const bannerTrasDismiss = await page.evaluate(() => !!document.querySelector('.sueldo-suggestion'));
  const countAfter = await page.evaluate(() => window.__debug.TX.length);
  check('Tras "Todavía no": banner desaparece', bannerTrasDismiss === false, bannerTrasDismiss);
  check('Tras "Todavía no": no se agregó nada', countAfter === countBefore, { countBefore, countAfter });

  await finish({ context, browser, errors });
})();
