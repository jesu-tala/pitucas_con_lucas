// Bug real reportado: "para los montos con cuotas deberíamos considerar el monto de la cuota
// de ese mes, no el total". Causa: al activar "Pago en cuotas" (o cambiar el número de cuotas),
// el monto de la transacción se dejaba tal cual (el precio TOTAL de la compra) y
// regenerateInstallmentsFor copiaba ese mismo monto completo a cada mes proyectado -- una compra
// de $90.000 en 3 cuotas terminaba contando $270.000 en el balance (3 meses x $90.000), en vez
// de $30.000 cada uno de los 3 meses ($90.000 en total). Ahora el monto de la transacción pasa a
// ser el de la cuota de ESE mes (montoTotal / cuotas), y montoTotal (el precio original) se
// guarda aparte para poder recalcular al cambiar el número de cuotas o al desactivarlas.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 420, height: 1400 } });

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push({ id: 'cuotaTest', fecha: D.todayISO(), hora: '10:00', comercio: 'Falabella Test', monto: 90000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 90000 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-tx="cuotaTest"]');
  await page.waitForTimeout(150);

  // Activar "Pago en cuotas" (arranca en 2 cuotas) -- el monto de la transacción debe pasar a
  // ser la mitad ($45.000), no seguir en $90.000.
  await page.click('[data-toggle-installments="cuotaTest"]');
  await page.waitForTimeout(150);
  let t = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 'cuotaTest'));
  check('Al activar cuotas (2 por defecto), el monto pasa a ser el de la cuota mensual ($45.000, no $90.000)',
    t.monto === 45000 && t.categorias[0].monto === 45000, t);
  check('Se guarda el precio total original (montoTotal) para poder recalcular después', t.cuotas.montoTotal === 90000, t.cuotas);

  // regenerateInstallmentsFor reasigna internamente el arreglo TRANSACTIONS (setTransactions) --
  // window.__debug.TRANSACTIONS queda apuntando al arreglo viejo (staleness ya documentada en
  // otros tests), así que las cuotas RECIÉN creadas (c2/c3) solo se ven leyendo un snapshot
  // fresco vía buildFullStateBlob() (que sí lee el TRANSACTIONS interno y vivo del módulo).
  let c2 = await page.evaluate(() => window.__debug.buildFullStateBlob().transacciones.find(t => t.id === 'cuotaTest-c2'));
  check('La cuota proyectada del mes siguiente también es $45.000 (no $90.000)', c2 && c2.monto === 45000, c2);

  // Subir a 3 cuotas -- el monto mensual debe recalcularse desde montoTotal ($90.000/3 = $30.000)
  await page.click('[data-installments-step="1"][data-tx="cuotaTest"]');
  await page.waitForTimeout(150);
  t = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 'cuotaTest'));
  check('Al subir a 3 cuotas, el monto mensual se recalcula a $30.000 (90.000/3)', t.monto === 30000 && t.categorias[0].monto === 30000, t);

  const proyectadas = await page.evaluate(() => window.__debug.buildFullStateBlob().transacciones.filter(t => t.cuotaOf === 'cuotaTest').map(t => t.monto));
  check('Las 2 cuotas proyectadas (meses 2 y 3) también quedan en $30.000 cada una', proyectadas.length === 2 && proyectadas.every(m => m === 30000), proyectadas);

  // Desactivar cuotas -- vuelve al precio total original, y las cuotas proyectadas desaparecen
  await page.click('[data-toggle-installments="cuotaTest"]');
  await page.waitForTimeout(150);
  t = await page.evaluate(() => window.__debug.TRANSACTIONS.find(t => t.id === 'cuotaTest'));
  check('Al desactivar "Pago en cuotas", el monto vuelve al precio total original ($90.000)', t.monto === 90000 && t.categorias[0].monto === 90000 && !t.cuotas, t);
  const sigueProyectadas = await page.evaluate(() => window.__debug.buildFullStateBlob().transacciones.some(t => t.cuotaOf === 'cuotaTest'));
  check('Y las cuotas proyectadas ya no existen', !sigueProyectadas);

  await finish({ context, browser, errors });
})();
