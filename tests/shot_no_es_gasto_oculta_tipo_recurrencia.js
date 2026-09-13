// Pedido real: "quiero que cuando yo marque acciones rápidas, no es ingreso o no es gasto, en el
// tipo de la transacción no esté marcado el gasto o ingreso, ni recurrencia variable/mensual/
// anual. Tal vez eso debería ni siquiera aparecer". Antes, marcar "No es gasto"/"No es ingreso"
// seguía mostrando el selector de Tipo (con Gasto/Ingreso ya "elegido") y el de Recurrencia --
// visualmente parecía que seguía siendo un gasto/ingreso de verdad, justo lo opuesto de lo que
// la persona acaba de decir. Ahora esa tarjeta completa (Tipo + Recurrencia) se oculta mientras
// la transacción esté marcada así.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push(
      { id: 'gastoTipoTest', fecha: D.todayISO(), hora: '10:00', comercio: 'Traspaso entre mis cuentas', monto: 100000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'otros', monto: 100000 }], porCobrar: [], reglaAuto: false, nota: '' },
      { id: 'ingresoTipoTest', fecha: D.todayISO(), hora: '11:00', comercio: 'Traspaso desde mi otra cuenta', monto: 100000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'pololos_extra', monto: 100000 }], porCobrar: [], reglaAuto: false, nota: '' }
    );
    D.state.tab = 'transacciones';
    D.render();
  });

  // ================= "No es gasto" =================
  await page.evaluate(() => { window.__debug.state.openTxId = 'gastoTipoTest'; document.getElementById('sheet-overlay').classList.add('open'); window.__debug.render(); });
  await page.waitForTimeout(150);
  const antesGasto = await page.evaluate(() => ({
    tieneTipo: !!document.querySelector('[data-seg="tipo"]'),
    tieneRecurrencia: !!document.querySelector('[data-seg="recurrencia"]'),
  }));
  check('Antes de marcar "No es gasto", se ven los selectores de Tipo y Recurrencia', antesGasto.tieneTipo && antesGasto.tieneRecurrencia, antesGasto);

  await page.click('[data-action="noesgasto"][data-tx="gastoTipoTest"]');
  await page.waitForTimeout(150);
  const trasMarcarGasto = await page.evaluate(() => ({
    tieneTipo: !!document.querySelector('[data-seg="tipo"]'),
    tieneRecurrencia: !!document.querySelector('[data-seg="recurrencia"]'),
  }));
  check('Al marcar "No es gasto", el selector de Tipo desaparece', trasMarcarGasto.tieneTipo === false, trasMarcarGasto);
  check('   y el de Recurrencia también', trasMarcarGasto.tieneRecurrencia === false, trasMarcarGasto);

  await page.click('[data-action="noesgasto"][data-tx="gastoTipoTest"]');
  await page.waitForTimeout(150);
  const trasDesmarcarGasto = await page.evaluate(() => ({
    tieneTipo: !!document.querySelector('[data-seg="tipo"]'),
    tieneRecurrencia: !!document.querySelector('[data-seg="recurrencia"]'),
  }));
  check('Al desmarcar "No es gasto", vuelven a aparecer ambos', trasDesmarcarGasto.tieneTipo && trasDesmarcarGasto.tieneRecurrencia, trasDesmarcarGasto);
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // ================= "No es ingreso" =================
  await page.evaluate(() => { window.__debug.state.openTxId = 'ingresoTipoTest'; document.getElementById('sheet-overlay').classList.add('open'); window.__debug.render(); });
  await page.waitForTimeout(150);
  const antesIngreso = await page.evaluate(() => ({
    tieneTipo: !!document.querySelector('[data-seg="tipo"]'),
    tieneRecurrencia: !!document.querySelector('[data-seg="recurrencia"]'),
  }));
  check('Antes de marcar "No es ingreso", se ven los selectores de Tipo y Recurrencia', antesIngreso.tieneTipo && antesIngreso.tieneRecurrencia, antesIngreso);

  await page.click('[data-action="noesgasto"][data-tx="ingresoTipoTest"]');
  await page.waitForTimeout(150);
  const trasMarcarIngreso = await page.evaluate(() => ({
    tieneTipo: !!document.querySelector('[data-seg="tipo"]'),
    tieneRecurrencia: !!document.querySelector('[data-seg="recurrencia"]'),
  }));
  check('Al marcar "No es ingreso", el selector de Tipo desaparece', trasMarcarIngreso.tieneTipo === false, trasMarcarIngreso);
  check('   y el de Recurrencia también', trasMarcarIngreso.tieneRecurrencia === false, trasMarcarIngreso);

  await finish({ context, browser, errors });
})();
