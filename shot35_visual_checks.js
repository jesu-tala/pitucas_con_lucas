const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

  await page.goto('file://' + path.join(__dirname, 'test.html'));
  await page.waitForTimeout(300);

  // Reembolso alignment: Farmacias Cruz Verde tiene un reembolso YA PAGADO (fila con tag)
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.tx-item')];
    const found = items.find(i => i.textContent.includes('Farmacias Cruz Verde'));
    found.click();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#sheet-content .action-btn')];
    const found = btns.find(b => b.textContent.includes('Cobro o reembolso pendiente'));
    if (found) found.click();
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot35_reembolso_alignment.png', clip: {x:0, y:0, width:420, height:500} });
  await page.evaluate(() => { const btn = document.getElementById('sheet-close-btn'); if (btn) btn.click(); });
  await page.waitForTimeout(150);

  // Evolucion mes seleccionado -> tasa de gastos
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-resumen-sub="evolucion"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'shot35_evolucion_mes.png', fullPage: true });

  // Inversiones: objetivo card vs total invertido, y sin boton "volver a valores base" en planificador
  await page.click('[data-resumen-sub="inversiones"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'shot35_inversiones_cards.png', fullPage: true });
  const hasResetBtn = await page.$('[data-plan-reset]') !== null;
  console.log('boton volver a valores base sigue existiendo (debe ser false):', hasResetBtn);

  console.log('ERRORS:', JSON.stringify(errors));
  await context.close();
  await browser.close();
})();
