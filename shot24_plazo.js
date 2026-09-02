const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light','dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 1000 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('TUNNEL')) errors.push(msg.text()); });
    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `shot24_${scheme}_01_top.png`, fullPage: true });

    // edit Fintual and set plazo to largo via segmented control, verify chip appears
    await page.click('[data-edit-platform="fintual"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot24_${scheme}_02_fintual_edit.png` });
    await page.click('[data-seg="platform-plazo"] [data-seg-val="largo"]');
    await page.waitForTimeout(100);
    await page.click('[data-save-platform="fintual"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot24_${scheme}_03_fintual_saved.png` });

    // scroll to banco de chile, check chips on nested metas
    await page.evaluate(() => {
      const nodes = document.querySelectorAll('.platform-name');
      for (const n of nodes) { if (n.textContent.includes('Banco de Chile')) { n.closest('.platform-group').scrollIntoView({block:'start'}); break; } }
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot24_${scheme}_04_banco_chile_chips.png` });

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
