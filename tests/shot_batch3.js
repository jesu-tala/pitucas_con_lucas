const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- 1) quick-actions: "Cobro o reembolso pendiente" split into two buttons ----------
  const txId = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(t => t.tipo === 'gasto' && t.estado !== 'no_es_gasto');
    return t.id;
  });
  await page.evaluate((id) => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); }, txId);
  await page.evaluate((id) => {
    // open the sheet directly via state (more robust than navigating the UI)
    window.__debug.state.openTxId = id;
    window.__debug.state.creatingNew = false;
    document.getElementById('sheet-overlay').classList.add('open');
    window.__debug.render();
  }, txId);
  await page.waitForTimeout(150);
  const dosBotones = await page.evaluate(() => {
    return {
      persona: !!document.querySelector('[data-action="porcobrar_persona"]'),
      reembolso: !!document.querySelector('[data-action="porcobrar_reembolso"]'),
      viejoUnico: !!document.querySelector('[data-action="porcobrar"]')
    };
  });
  check('1) Aparecen los 2 botones separados (persona + reembolso), y ya no el combinado', dosBotones.persona && dosBotones.reembolso && !dosBotones.viejoUnico, dosBotones);

  await page.click('[data-action="porcobrar_reembolso"]');
  await page.waitForTimeout(150);
  const trasReembolso = await page.evaluate((id) => {
    const t = window.__debug.TRANSACTIONS.find(t => t.id === id);
    return { estado: t.estado, tipos: t.porCobrar.map(p => p.tipo) };
  }, txId);
  check('Al apretar "Reembolso pendiente" queda estado por_cobrar y se agrega UNA fila tipo reembolso', trasReembolso.estado === 'por_cobrar' && trasReembolso.tipos.includes('reembolso'), trasReembolso);

  // the split block, in "only reimbursement" mode, offers ONLY "Agregar reembolso"
  const botonesSoloReembolso = await page.evaluate(() => ({
    persona: !!document.querySelector('[data-add-charge-row]'),
    reembolso: !!document.querySelector('[data-add-reimbursement-row]')
  }));
  check('En modo solo-reembolso, el bloque de abajo NO ofrece "Agregar persona", solo "Agregar reembolso"', !botonesSoloReembolso.persona && botonesSoloReembolso.reembolso, botonesSoloReembolso);

  // pressing "Reembolso pendiente" again DESELECTS it (back to confirmado, no rows)
  await page.click('[data-action="porcobrar_reembolso"]');
  await page.waitForTimeout(150);
  const trasDeseleccionar = await page.evaluate((id) => {
    const t = window.__debug.TRANSACTIONS.find(t => t.id === id);
    return { estado: t.estado, n: t.porCobrar.length };
  }, txId);
  check('Apretar "Reembolso pendiente" de nuevo lo deselecciona (vuelve a confirmado, sin filas)', trasDeseleccionar.estado === 'confirmado' && trasDeseleccionar.n === 0, trasDeseleccionar);

  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  const trasPersona = await page.evaluate((id) => {
    const t = window.__debug.TRANSACTIONS.find(t => t.id === id);
    return { estado: t.estado, tipos: t.porCobrar.map(p => p.tipo) };
  }, txId);
  check('Al apretar "Por cobrar a alguien" queda estado por_cobrar y se agrega UNA fila tipo persona', trasPersona.estado === 'por_cobrar' && trasPersona.tipos.length===1 && trasPersona.tipos[0]==='persona', trasPersona);

  const botonesSoloPersona = await page.evaluate(() => ({
    persona: !!document.querySelector('[data-add-charge-row]'),
    reembolso: !!document.querySelector('[data-add-reimbursement-row]')
  }));
  check('En modo solo-persona, el bloque de abajo NO ofrece "Agregar reembolso", solo "Agregar persona"', botonesSoloPersona.persona && !botonesSoloPersona.reembolso, botonesSoloPersona);

  await page.click('[data-action="porcobrar_persona"]');
  await page.waitForTimeout(150);
  const trasDeseleccionar2 = await page.evaluate((id) => {
    const t = window.__debug.TRANSACTIONS.find(t => t.id === id);
    return { estado: t.estado, n: t.porCobrar.length };
  }, txId);
  check('Apretar "Por cobrar a alguien" de nuevo también lo deselecciona', trasDeseleccionar2.estado === 'confirmado' && trasDeseleccionar2.n === 0, trasDeseleccionar2);

  // "No es gasto" can also be deselected by pressing it again
  // Force a category on it first: a category no longer applies to anything once the
  // transaction stops counting as a real expense, and it must be cleared when marking this
  // (bug reported: a category picked before toggling "No es gasto" stayed stuck on the
  // transaction, still counting in Balance/Presupuesto even though it no longer showed as spent).
  await page.evaluate((id) => { window.__debug.TRANSACTIONS.find(t => t.id === id).categorias = [{cat:'restoranes', monto:100}]; }, txId);
  await page.evaluate(() => window.__debug.render());
  await page.waitForTimeout(100);
  await page.click('[data-action="noesgasto"]');
  await page.waitForTimeout(150);
  const noEsGastoOn = await page.evaluate((id) => window.__debug.TRANSACTIONS.find(t => t.id === id), txId);
  check('"No es gasto" se marca', noEsGastoOn.estado === 'no_es_gasto', noEsGastoOn.estado);
  check('   y le quita la categoría que tenía asignada (ya no corresponde a ninguna)', noEsGastoOn.categorias.length === 0, noEsGastoOn.categorias);
  await page.click('[data-action="noesgasto"]');
  await page.waitForTimeout(150);
  const noEsGastoOff = await page.evaluate((id) => window.__debug.TRANSACTIONS.find(t => t.id === id).estado, txId);
  check('"No es gasto" se puede deseleccionar (vuelve a "pendiente" al quedar sin categoría)', noEsGastoOff === 'pendiente', noEsGastoOff);

  // ---------- 6) "Sin categoría" is now a row with a <select>, always editable ----------
  // (before you had to tap a chip to enter an "edit mode" with the icon grid;
  // now the row with the select is already there, ready to pick from, no intermediate step)
  const txSinCatId = await page.evaluate(() => {
    // find or force a confirmed transaction with no categories to test the empty row
    const t = window.__debug.TRANSACTIONS.find(t => t.tipo === 'gasto');
    t.categorias = [];
    t.estado = 'confirmado';
    return t.id;
  });
  await page.evaluate((id) => {
    window.__debug.state.openTxId = id;
    window.__debug.render();
  }, txSinCatId);
  await page.waitForTimeout(150);
  const rowInfo = await page.evaluate(() => {
    const sel = document.querySelector('[data-cat-select="0"]');
    return sel ? { tag: sel.tagName, value: sel.value } : null;
  });
  check('6) "Sin categoría" es una fila con <select> (data-cat-select="0"), vacía por defecto', rowInfo && rowInfo.tag === 'SELECT' && rowInfo.value === '', rowInfo);

  const catIdElegida = await page.evaluate(() => {
    const opt = document.querySelector('[data-cat-select="0"] option[value]:not([value=""])');
    return opt ? opt.value : null;
  });
  if (catIdElegida) {
    await page.selectOption('[data-cat-select="0"]', catIdElegida);
    await page.waitForTimeout(150);
    const quedoClasificada = await page.evaluate((id) => window.__debug.TRANSACTIONS.find(t => t.id === id).categorias.length > 0, txSinCatId);
    check('Y se le puede asignar una categoría real desde el mismo selector', quedoClasificada);
  }

  await page.evaluate(() => { document.getElementById('sheet-overlay').classList.remove('open'); window.__debug.state.openTxId = null; });

  // ---------- 2) absolute amounts in fijo/variable/investment goals ----------
  await page.evaluate(() => { window.__debug.state.tab = 'resumen'; window.__debug.state.summarySub = 'presupuesto'; window.__debug.render(); });
  await page.waitForTimeout(150);
  const figsAbs = await page.evaluate(() => Array.from(document.querySelectorAll('.metas-gasto-fig-abs')).map(e => e.textContent));
  check('2) Aparecen montos absolutos ($) junto al % en la tarjeta de metas', figsAbs.length === 3, figsAbs);

  // ---------- 4a/4d) note excluding investment + clear text for the % in the total budget ----------
  const notaYPct = await page.evaluate(() => {
    const nota = document.querySelector('.budget-total-note');
    const rem = document.querySelector('.budget-total-remaining');
    return { nota: nota ? nota.textContent : null, rem: rem ? rem.textContent : null };
  });
  check('4a) Nota aclarando que el presupuesto total no incluye inversión', /inversi/i.test(notaYPct.nota||''), notaYPct.nota);
  check('4d) El % del presupuesto total ahora se explica en palabras (no un % suelto)', /presupuesto/i.test(notaYPct.rem||''), notaYPct.rem);

  // ---------- 4c) clarification that "fijo" = mensual/anual in the sheet ----------
  await page.evaluate((id) => {
    window.__debug.state.openTxId = id;
    document.getElementById('sheet-overlay').classList.add('open');
    window.__debug.render();
  }, txId);
  await page.waitForTimeout(150);
  const hintRecurrencia = await page.evaluate(() => {
    const hints = Array.from(document.querySelectorAll('.cat-picker-hint'));
    const h = hints.find(e => /Mensual/.test(e.textContent) && /gasto fijo/i.test(e.textContent));
    return h ? h.textContent : null;
  });
  check('4c) Hay una aclaración de que Mensual/Anual = gasto fijo, junto al selector de Recurrencia', !!hintRecurrencia, hintRecurrencia);

  // ---------- 3) goal-% marker on the Balance gauge ----------
  // The marker is only drawn if the displayed month has income ("sinIngresos" hides it). The
  // month Balance shows by default is TODAY's real month, and the demo data has fixed
  // dates -- so if the real calendar has already passed the last demo income entry, this month ends up
  // with no income and the check would fail without it being a real bug. We make sure the current month
  // has an income entry before checking the 3 markers.
  await page.evaluate(() => {
    const D = window.__debug;
    const ym = D.MONTHS[D.state.monthIndex];
    const yaHayIngreso = D.TRANSACTIONS.some(t => t.tipo === 'ingreso' && t.fecha.slice(0,7) === ym);
    if (!yaHayIngreso) {
      D.TRANSACTIONS.push({ id: 't_ingreso_gauge_test', fecha: ym + '-03', hora: '09:00', comercio: 'Sueldo Test Gauge',
        monto: 1000000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado',
        categorias: [{ cat: 'sueldo', monto: 1000000 }], porCobrar: [], reglaAuto: false, nota: '' });
    }
  });
  await page.evaluate(() => { document.getElementById('sheet-overlay').classList.remove('open'); window.__debug.state.openTxId = null; window.__debug.state.tab = 'resumen'; window.__debug.state.summarySub = 'balance'; window.__debug.render(); });
  await page.waitForTimeout(150);
  const goalMarkers = await page.evaluate(() => Array.from(document.querySelectorAll('.meta-goal-marker')).map(e => ({ text: e.textContent, left: e.style.left })));
  check('3) Hay un marcador de % objetivo (chico) en cada franja del gauge de Balance (esperado 3)', goalMarkers.length === 3, goalMarkers);

  // ---------- Current month's Balance (previous regression, still being checked) ----------
  const mesActual = await page.evaluate(() => {
    const el = document.querySelector('.month-switcher .m-label');
    return el ? el.textContent : null;
  });
  console.log('Regresión: Balance sigue mostrando el mes actual:', mesActual);

  // ---------- 5) anti-bounce CSS for the mobile tabbar (420px viewport, the <=480px media query is already active) ----------
  const cssCheck = await page.evaluate(() => {
    const htmlStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    return {
      htmlOverscroll: htmlStyle.overscrollBehaviorY || htmlStyle.overscrollBehavior,
      bodyOverscroll: bodyStyle.overscrollBehaviorY || bodyStyle.overscrollBehavior,
      bodyOverflow: bodyStyle.overflowY,
      bodyHeight: bodyStyle.height
    };
  });
  check('5) A 420px de ancho (mobile), html/body quedan con overscroll-behavior:none y body con overflow:hidden, para evitar el rebote de Safari', /none/.test(cssCheck.htmlOverscroll) && /none/.test(cssCheck.bodyOverscroll) && cssCheck.bodyOverflow==='hidden', cssCheck);

  // ---------- New: "Datos de transferencia" in Menu > Mi cuenta ----------
  await page.evaluate(() => {
    window.__debug.state.tab = 'menu';
    window.__debug.state.menuSection = 'cuenta';
    window.__debug.render();
  });
  await page.waitForTimeout(150);
  const sinDatos = await page.evaluate(() => document.body.textContent.includes('Agrégalos para poder copiar'));
  check('Nuevo) Mi cuenta muestra el hint de "agrega tus datos" cuando está vacío', sinDatos);

  await page.click('[data-edit-transfer-info]');
  await page.waitForTimeout(120);
  await page.fill('[data-transfer-info-input="nombre"]', 'Jesu Tala');
  await page.fill('[data-transfer-info-input="rut"]', '12.345.678-9');
  await page.fill('[data-transfer-info-input="banco"]', 'Banco Edwards');
  await page.fill('[data-transfer-info-input="tipoCuenta"]', 'Cuenta Corriente');
  await page.fill('[data-transfer-info-input="numeroCuenta"]', '000123456789');
  await page.click('[data-save-transfer-info]');
  await page.waitForTimeout(150);
  const datosGuardados = await page.evaluate(() => window.__debug.TRANSFER_INFO);
  check('Se guardan los datos de transferencia', datosGuardados.nombre==='Jesu Tala' && datosGuardados.banco==='Banco Edwards', datosGuardados);

  const cardMuestraDatos = await page.evaluate(() => document.querySelector('.datos-transferencia-figs') ? document.querySelector('.datos-transferencia-figs').textContent : null);
  console.log('   La tarjeta ahora muestra los datos guardados:', cardMuestraDatos);

  // ---------- New: copy pending charge in WhatsApp format ----------
  const whatsappTxt = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(t => t.tipo === 'gasto');
    t.estado = 'por_cobrar';
    t.monto = 7000;
    t.porCobrar = [
      {persona:'Jose', monto:3500, pagado:false, tipo:'persona', montoRecibido:null, linkedTxId:null},
      {persona:'Mamá', monto:3000, pagado:false, tipo:'persona', montoRecibido:null, linkedTxId:null},
      {persona:'Ya pagó', monto:500, pagado:true, tipo:'persona', montoRecibido:500, linkedTxId:null}
    ];
    return { texto: window.__debug.buildChargeWhatsAppText(t), txId: t.id };
  });
  const contieneEsperado = whatsappTxt.texto === 'Pendiente de pago\nJose $3.500\nMamá $3.000\n\nDatos transferencia\nJesu Tala\nBanco Edwards · Cuenta Corriente\nCuenta 000123456789\nRUT 12.345.678-9';
  check('Coincide exactamente con el formato esperado (persona + monto, sin la ya pagada, + datos de transferencia)', contieneEsperado, whatsappTxt.texto);

  // the "Copiar para WhatsApp" button appears in the sheet when there are pending persona-type charges
  await page.evaluate((id) => {
    window.__debug.state.tab = 'transacciones';
    window.__debug.state.openTxId = id;
    document.getElementById('sheet-overlay').classList.add('open');
    window.__debug.render();
  }, whatsappTxt.txId);
  await page.waitForTimeout(150);
  const botonVisible = await page.evaluate(() => !!document.querySelector('[data-copy-charge]'));
  check('El botón "Copiar para WhatsApp" aparece en el detalle', botonVisible);

  await finish({ context, browser, errors });
})();
