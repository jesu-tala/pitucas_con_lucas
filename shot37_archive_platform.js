const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light','dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('TUNNEL')) errors.push('console: ' + msg.text()); });
    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.evaluate(() => { const g = document.getElementById('auth-gate'); if (g) g.hidden = true; });
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(200);

    const totalBefore = await page.evaluate(() => {
      const label = [...document.querySelectorAll('.platform-total-label')].find(el=>el.textContent.includes('Total invertido'));
      return label.closest('.card').querySelector('.platform-total-value').textContent.trim();
    });
    console.log(scheme, 'Total invertido ANTES de cerrar Buda:', totalBefore);

    // abrir edicion de Buda
    await page.evaluate(() => {
      const names = [...document.querySelectorAll('.platform-name')];
      const budaCard = names.find(n => n.textContent.includes('Buda'))?.closest('.platform-card');
      const editBtn = budaCard.querySelector('[data-edit-platform]');
      editBtn.click();
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot37_${scheme}_00_editing_buda.png`, fullPage: true });
    const hasArchiveBtn = await page.$('[data-archive-platform="buda"]') !== null;
    const hasDeleteBtn = await page.$('[data-delete-platform="buda"]') !== null;
    console.log(scheme, 'Buda tiene boton "Cerrar plataforma" (tiene TX):', hasArchiveBtn, '| boton eliminar (no debería):', hasDeleteBtn);

    await page.click('[data-archive-platform="buda"]');
    await page.waitForTimeout(150);
    await page.click('[data-confirm-archive-platform="buda"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot37_${scheme}_01_buda_cerrada.png`, fullPage: true });
    const budaGoneFromActive = await page.evaluate(() => {
      const names = [...document.querySelectorAll('.platform-group .platform-name')];
      return !names.some(n => n.textContent.includes('Buda'));
    });
    console.log(scheme, 'Buda ya no aparece en Mis plataformas activas:', budaGoneFromActive);
    const budaInArchived = await page.evaluate(() => document.getElementById('view-root').textContent.includes('Plataformas cerradas') && document.getElementById('view-root').textContent.includes('Buda'));
    console.log(scheme, 'Buda aparece en "Plataformas cerradas":', budaInArchived);
    const totalAfter = await page.evaluate(() => {
      const label = [...document.querySelectorAll('.platform-total-label')].find(el=>el.textContent.includes('Total invertido'));
      return label.closest('.card').querySelector('.platform-total-value').textContent.trim();
    });
    console.log(scheme, 'Total invertido DESPUES de cerrar Buda (debe bajar en $17.500):', totalAfter);

    // verificar que sus transacciones pasadas SIGUEN intactas en Transacciones
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    const budaTxStillThere = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tx-item')];
      return items.some(i => i.textContent.includes('Buda'));
    });
    console.log(scheme, 'Transacciones de Buda siguen visibles en Transacciones:', budaTxStillThere);

    // reabrir Buda
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(200);
    await page.click('[data-reopen-platform="buda"]');
    await page.waitForTimeout(200);
    const budaBackActive = await page.evaluate(() => {
      const names = [...document.querySelectorAll('.platform-group .platform-name')];
      return names.some(n => n.textContent.includes('Buda'));
    });
    console.log(scheme, 'Buda reabierta, vuelve a Mis plataformas:', budaBackActive);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
