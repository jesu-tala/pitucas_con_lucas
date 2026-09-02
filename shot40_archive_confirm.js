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
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const names = [...document.querySelectorAll('.platform-name')];
      const budaCard = names.find(n => n.textContent.includes('Buda'))?.closest('.platform-card');
      budaCard.querySelector('[data-edit-platform]').click();
    });
    await page.waitForTimeout(150);
    await page.click('[data-archive-platform="buda"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot40_${scheme}_00_confirm_cerrar.png`, fullPage: true });
    const stillActiveAfterFirstClick = await page.evaluate(() => {
      const names = [...document.querySelectorAll('.platform-group .platform-name')];
      return names.some(n => n.textContent.includes('Buda'));
    });
    const showsConfirmText = await page.evaluate(() => document.getElementById('view-root').textContent.includes('Cerrar esta plataforma'));
    console.log(scheme, 'Buda sigue activa tras 1er click (no debe cerrar aun):', stillActiveAfterFirstClick, '| muestra confirmacion:', showsConfirmText);
    await page.click('[data-cancel-archive-platform]');
    await page.waitForTimeout(150);
    const stillActiveAfterCancel = await page.evaluate(() => {
      const names = [...document.querySelectorAll('.platform-group .platform-name')];
      return names.some(n => n.textContent.includes('Buda'));
    });
    console.log(scheme, 'Buda sigue activa tras Cancelar:', stillActiveAfterCancel);
    // reintentar y confirmar
    await page.click('[data-archive-platform="buda"]');
    await page.waitForTimeout(150);
    await page.click('[data-confirm-archive-platform="buda"]');
    await page.waitForTimeout(200);
    const closedNow = await page.evaluate(() => {
      const names = [...document.querySelectorAll('.platform-group .platform-name')];
      return !names.some(n => n.textContent.includes('Buda'));
    });
    console.log(scheme, 'Buda cerrada tras confirmar:', closedNow);
    // verificar que ya NO aparece en Menu > Categorias
    await page.click('[data-tab="menu"]');
    await page.waitForTimeout(150);
    await page.click('[data-menu-open="categorias"]');
    await page.waitForTimeout(200);
    const goneFromMenu = await page.evaluate(() => !document.getElementById('view-root').textContent.includes('Buda'));
    console.log(scheme, 'Buda NO aparece en Menu > Categorias tras cerrarla:', goneFromMenu);
    await page.click('[data-menu-back]');
    await page.waitForTimeout(150);
    // reabrir y verificar que vuelve a aparecer en Menu > Categorias
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(200);
    await page.click('[data-reopen-platform="buda"]');
    await page.waitForTimeout(150);
    await page.click('[data-tab="menu"]');
    await page.waitForTimeout(150);
    await page.click('[data-menu-open="categorias"]');
    await page.waitForTimeout(200);
    const backInMenu = await page.evaluate(() => document.getElementById('view-root').textContent.includes('Buda'));
    console.log(scheme, 'Buda vuelve a aparecer en Menu > Categorias tras reabrir:', backInMenu);
    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
