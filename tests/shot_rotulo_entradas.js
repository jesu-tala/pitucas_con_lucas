// El cuadro izquierdo en Transacciones/Entradas decía "INGRESOS" -- debe decir "ENTRADAS".
// Siguen siendo DOS CUADROS SEPARADOS (Entradas / Reembolsos), cada uno con su propio rótulo y
// monto -- no se combinan en un solo encabezado "Entradas y reembolsos".
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      { id: 't1', fecha: D.todayISO(), hora: '10:00', comercio: 'Sueldo', monto: 1000000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: 1000000 }], porCobrar: [] }
    );
    D.state.filter = 'entradas';
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  const cuadros = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.stat-grid .stat-tile'));
    return tiles.map(t => ({
      label: t.querySelector('.stat-label')?.textContent.trim(),
      value: t.querySelector('.stat-value')?.textContent.trim()
    }));
  });
  console.log('cuadros de Entradas:', JSON.stringify(cuadros));

  check('Son 2 cuadros separados (no un único encabezado combinado)', cuadros.length === 2, cuadros);
  check('El cuadro izquierdo dice "Entradas" (antes "Ingresos")', cuadros[0]?.label === 'Entradas', cuadros[0]);
  check('El cuadro derecho sigue diciendo "Reembolsos", con su propio monto', cuadros[1]?.label === 'Reembolsos', cuadros[1]);
  check('Ningún cuadro combina ambos rótulos en uno solo', !cuadros.some(c => /Entradas y reembolsos/i.test(c.label || '')), cuadros);

  await finish({ context, browser, errors });
})();
