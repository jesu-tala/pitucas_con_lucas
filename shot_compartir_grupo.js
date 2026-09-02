// UI: "Compartir con un grupo" en el detalle de una transacción (gastos compartidos, fase UI).
// La escritura real contra Supabase (compartirTransaccionExistente) no se puede probar de punta
// a punta acá -- igual que crearGrupo/unirseAGrupo/agregarParticipanteSinCuenta, depende de "sb"
// (el cliente de Supabase, bloqueado por la política de red del sandbox) -- así que este test
// se enfoca en lo que SÍ es puramente de UI: que la sección no aparezca sin grupos, que aparezca
// y se abra correctamente con grupos (inyectados por window.__debug, igual que
// audit_gastos_compartidos.js), que el selector de pagador y los checkboxes de participantes
// reaccionen y recalculen el reparto en partes iguales en vivo, y que Cancelar cierre el form.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // t2 = Copec Providencia, $18.000, gasto confirmado -- buen candidato: monto par, sin
  // porCobrar/no_es_gasto previos que compliquen la lectura del test.
  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // (a) Sin ningún grupo creado todavía: la sección no debe aparecer en absoluto.
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(200);
  const sinGrupos = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Compartir con un grupo'));
  check('(a) Sin grupos creados: no aparece "Compartir con un grupo" en el detalle', sinGrupos === false);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // Inyectamos un grupo "Casa" con 2 participantes: Yo (currentUser) y Fran.
  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GRUPOS = [{ id: 'g1', nombre: 'Casa', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GRUPO_PARTICIPANTES = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    D.GASTOS_COMPARTIDOS = [];
    D.render();
  });

  // (b) Con un grupo disponible y la transacción todavía sin compartir: botón cerrado "Elegir un grupo".
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(200);
  const cerrado = await page.evaluate(() => ({
    tieneSeccion: document.getElementById('sheet-content').textContent.includes('Compartir con un grupo'),
    tieneBotonAbrir: !!document.querySelector('[data-compartir-abrir="t2"]'),
    formAbierto: !!document.querySelector('[data-compartir-grupo]'),
  }));
  check('(b) Con un grupo y tx sin compartir: aparece la sección con botón "Elegir un grupo"', cerrado.tieneSeccion && cerrado.tieneBotonAbrir, cerrado);
  check('   el formulario todavía no está abierto', cerrado.formAbierto === false, cerrado);

  // (c) Al abrir, se ve el select de grupo, el pagador (Yo por defecto) y ambos participantes
  // incluidos por defecto, con el reparto en partes iguales ($9.000 c/u de $18.000).
  await page.click('[data-compartir-abrir="t2"]');
  await page.waitForTimeout(150);
  const abierto = await page.evaluate(() => {
    const content = document.getElementById('sheet-content');
    const checks = Array.from(document.querySelectorAll('[data-compartir-incluir]'));
    return {
      tieneSelectGrupo: !!document.querySelector('[data-compartir-grupo]'),
      pagadorSeleccionado: document.querySelector('.segmented[data-seg="compartir-pagador"] button.active')?.textContent || null,
      cantidadCheckboxes: checks.length,
      todosMarcados: checks.every(c => c.checked),
      totalRepartido: content.textContent.includes('$18.000 de $18.000'),
      botonCompartirHabilitado: !document.querySelector('[data-compartir-confirmar="t2"]').disabled,
    };
  });
  check('(c) Al abrir el form: aparece el select de grupo', abierto.tieneSelectGrupo === true, abierto);
  check('   "Yo" viene seleccionada por defecto como quien pagó', abierto.pagadorSeleccionado === 'Yo', abierto);
  check('   los 2 participantes vienen incluidos por defecto (2 checkboxes marcados)', abierto.cantidadCheckboxes === 2 && abierto.todosMarcados === true, abierto);
  check('   el reparto en partes iguales suma el total exacto ($18.000 de $18.000)', abierto.totalRepartido === true, abierto);
  check('   el botón "Compartir" está habilitado (reparto completo)', abierto.botonCompartirHabilitado === true, abierto);

  // (d) Desmarcar un participante recalcula el reparto en vivo (ahora solo Yo, 100% del gasto).
  await page.click('[data-compartir-incluir="p2"]');
  await page.waitForTimeout(150);
  const desmarcado = await page.evaluate(() => {
    const content = document.getElementById('sheet-content');
    return {
      p2Marcado: document.querySelector('[data-compartir-incluir="p2"]').checked,
      totalTexto: content.textContent,
    };
  });
  check('(d) Al desmarcar a Fran, su checkbox queda desmarcado', desmarcado.p2Marcado === false, desmarcado);
  check('   el reparto se recalcula: ahora Yo cubre el total completo ($18.000 de $18.000)',
    desmarcado.totalTexto.includes('$18.000 de $18.000'), desmarcado.totalTexto.slice(0, 400));

  // (e) Cambiar el pagador a Fran vía el segmented control actualiza el draft en memoria.
  await page.click('[data-compartir-incluir="p2"]'); // lo volvemos a incluir
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Fran' && b.closest('.segmented'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(150);
  const pagadorCambiado = await page.evaluate(() => window.__debug.state.compartirDraft.pagadoPorId);
  check('(e) Elegir a Fran como pagador actualiza el draft (pagadoPorId = p2)', pagadorCambiado === 'p2', pagadorCambiado);

  // (f) Cancelar cierra el formulario y vuelve al botón "Elegir un grupo", sin tocar la transacción.
  await page.click('[data-compartir-cancelar]');
  await page.waitForTimeout(150);
  const cancelado = await page.evaluate(() => ({
    formAbierto: !!document.querySelector('[data-compartir-grupo]'),
    botonAbrir: !!document.querySelector('[data-compartir-abrir="t2"]'),
    txSigueSinGrupo: window.__debug.TX.find(t => t.id === 't2').grupoId === undefined,
  }));
  check('(f) Cancelar cierra el form y vuelve al botón "Elegir un grupo"', cancelado.formAbierto === false && cancelado.botonAbrir === true, cancelado);
  check('   la transacción original no quedó modificada (sin grupoId)', cancelado.txSigueSinGrupo === true, cancelado);

  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (g) Una transacción YA compartida (grupoId puesto a mano, simulando que compartirTransaccionExistente
  // ya corrió) muestra la tarjeta de solo lectura "ya compartido", sin el botón de elegir grupo.
  await page.evaluate(() => {
    const D = window.__debug;
    const t3 = D.TX.find(t => t.id === 't3');
    t3.grupoId = 'g1';
    D.render();
  });
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);
  const yaCompartido = await page.evaluate(() => {
    const content = document.getElementById('sheet-content');
    return {
      tieneTexto: content.textContent.includes('ya se compartió con') && content.textContent.includes('Casa'),
      tieneBotonAbrir: !!document.querySelector('[data-compartir-abrir="t3"]'),
    };
  });
  check('(g) Una tx ya compartida (grupoId puesto) muestra la tarjeta de solo lectura con el nombre del grupo', yaCompartido.tieneTexto === true, yaCompartido);
  check('   y ya no ofrece el botón de "Elegir un grupo" (no se puede volver a compartir desde acá)', yaCompartido.tieneBotonAbrir === false, yaCompartido);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  await finish({ context, browser, errors });
})();
