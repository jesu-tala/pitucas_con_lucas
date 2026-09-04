const { openApp, check, finish } = require('./lib/test_kit');
const path = require('path');

(async () => {
  const { context, browser, page, errors } = await openApp();
  await page.evaluate(() => {
    // In this test environment there's no network access to cdnjs, so we point the
    // pdf.js worker to the local copy (only for the test -- in production it uses the real CDN).
    if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
  });

  // Go straight to the reconcile menu.
  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="reconciliar"]');
  await page.waitForTimeout(150);

  const tieneInputArchivo = await page.$('[data-reconcile-file-input]') !== null;
  check('Existe el input de archivo PDF', tieneInputArchivo);

  // 1) Real CHECKING ACCOUNT statement (Banco Edwards)
  const fileInput = await page.$('[data-reconcile-file-input]');
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'cartola_ejemplo.pdf'));
  await page.waitForTimeout(1500);

  const resultado1 = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return { tipo: R.tipo, error: R.error, n: R.movimientos.length, movs: R.movimientos.slice(0,5) };
  });
  console.log('--- Cuenta corriente ---');
  console.log('tipo detectado:', resultado1.tipo, '| error:', resultado1.error, '| movimientos:', resultado1.n);
  console.log('primeros 5:', JSON.stringify(resultado1.movs, null, 1));

  const tieneSueldo = await page.evaluate(() => window.__debug.state.reconciliar.movimientos.some(m => m.esEspecial==='sueldo' && m.monto===2016032));
  check('Detectó el sueldo real (2.016.032) el 29/07', tieneSueldo);

  const sumaCargos = await page.evaluate(() => window.__debug.state.reconciliar.movimientos.filter(m=>m.tipoMov==='gasto').reduce((s,m)=>s+Math.abs(m.monto),0));
  check('Suma de cargos detectados (esperado 4.073.308)', sumaCargos === 4073308, sumaCargos);
  const sumaAbonos = await page.evaluate(() => window.__debug.state.reconciliar.movimientos.filter(m=>m.tipoMov==='ingreso').reduce((s,m)=>s+Math.abs(m.monto),0));
  check('Suma de abonos detectados (esperado 5.033.235)', sumaAbonos === 5033235, sumaAbonos);

  const pagosTarjetaCount = await page.evaluate(() => window.__debug.state.reconciliar.movimientos.filter(m=>m.esEspecial==='pago_tarjeta').length);
  check('Filas "CARGO POR PAGO TC" detectadas como pago_tarjeta (esperado 6)', pagosTarjetaCount === 6, pagosTarjetaCount);

  // Test adding one of the suggested movements
  const addBtn = await page.$('[data-reconcile-add]');
  const txCountBefore = await page.evaluate(() => window.__debug.TRANSACTIONS.length);
  if (addBtn) await addBtn.click();
  await page.waitForTimeout(200);
  const txCountAfter = await page.evaluate(() => window.__debug.TRANSACTIONS.length);
  check('Al apretar "+ Agregar" en un movimiento, se crea 1 transacción', txCountAfter === txCountBefore + 1, { txCountBefore, txCountAfter });

  // Reset and test with the CARD statement (Visa)
  await page.click('[data-reconcile-reset]');
  await page.waitForTimeout(150);
  const fileInput2 = await page.$('[data-reconcile-file-input]');
  await fileInput2.setInputFiles(path.join(__dirname, 'fixtures', 'cartola_visa_dec.pdf'));
  await page.waitForTimeout(1500);
  const resultado2 = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return { tipo: R.tipo, error: R.error, n: R.movimientos.length };
  });
  console.log('--- Tarjeta de crédito (Visa) ---');
  console.log('tipo detectado:', resultado2.tipo, '| error:', resultado2.error, '| movimientos:', resultado2.n);

  const tieneUber = await page.evaluate(() => window.__debug.state.reconciliar.movimientos.some(m => /UBER TRIP/.test(m.detalle) && m.monto===-6053));
  check('Detectó la compra de Uber Trip $6.053', tieneUber);
  const tienePagoExcluido = await page.evaluate(() => !window.__debug.state.reconciliar.movimientos.some(m => /MONTO CANCELADO/.test(m.detalle) && m.esEspecial!=='pago_recibido'));
  check('"MONTO CANCELADO" queda marcado como pago_recibido (no como compra normal)', tienePagoExcluido);

  const sumaComprasUnaCuota = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return R.movimientos.filter(m => m.esEspecial===null).reduce((s,m)=>s+Math.abs(m.monto),0);
  });
  console.log('Suma de compras (una cuota + en cuotas, sin comisión/interés separados aparte):', sumaComprasUnaCuota);

  await finish({ context, browser, errors });
})();
