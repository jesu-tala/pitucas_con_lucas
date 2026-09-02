const { chromium } = require('playwright');
const path = require('path');

async function closeSheetIfOpen(page) {
  const open = await page.$('.sheet-overlay.open');
  if (open) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];

  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 900, height: 950 },
      colorScheme: scheme,
    });
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') errors.push(scheme + ': ' + msg.text()); });
    page.on('pageerror', err => errors.push(scheme + ' pageerror: ' + err.message));

    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shot_${scheme}_1_transacciones.png` });

    await page.click('button[data-tab="resumen"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot_${scheme}_2_resumen.png` });

    const legendRows = await page.$$('.legend-row');
    if (legendRows.length > 0) {
      await legendRows[0].click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `shot_${scheme}_3_drilldown.png` });
    }

    await closeSheetIfOpen(page);
    await page.click('button[data-tab="transacciones"]');
    await page.waitForTimeout(150);
    const txItems = await page.$$('.tx-item');
    if (txItems.length > 0) {
      await txItems[0].click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `shot_${scheme}_4_sheet.png` });
    }

    const splitLink = await page.$('[data-toggle-catsplit]');
    if (splitLink) {
      await splitLink.click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: `shot_${scheme}_5_catsplit.png` });
    }

    await closeSheetIfOpen(page);
    await page.click('button[data-tab="transacciones"]');
    await page.waitForTimeout(150);
    const clearFilter = await page.$('[data-clear-catfilter]');
    if (clearFilter) { await clearFilter.click(); await page.waitForTimeout(150); }
    const restobar = await page.$('button[data-tx="t5"]');
    if (restobar) {
      await restobar.click();
      await page.waitForTimeout(400);
      const openCalcLink = await page.$('[data-toggle-cobrosplit]');
      if (openCalcLink) { await openCalcLink.click(); await page.waitForTimeout(150); }
      await page.screenshot({ path: `shot_${scheme}_6_porcobrar.png` });
    }

    await closeSheetIfOpen(page);
    await page.click('button[data-tab="menu"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot_${scheme}_7_menu.png` });

    await context.close();
  }

  await browser.close();
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
})();
