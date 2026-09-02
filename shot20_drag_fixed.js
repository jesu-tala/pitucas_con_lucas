const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message + '\n' + err.stack));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('TUNNEL')) errors.push('console: ' + msg.text()); });

    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(200);
    // NO scroll this time — subtabs bar stays at top, visible.
    await page.screenshot({ path: `shot20_${scheme}_00_before.png` });

    const subtabsBefore = await page.$$eval('[data-resumen-sub]', els => els.map(e=>e.getAttribute('data-resumen-sub')));
    console.log(scheme, 'order before:', subtabsBefore);

    const invBox = await page.$eval('[data-resumen-sub="inversiones"]', el => { const r = el.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });
    const balBox = await page.$eval('[data-resumen-sub="balance"]', el => { const r = el.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });

    await page.mouse.move(invBox.x, invBox.y);
    await page.mouse.down();
    await page.mouse.move(invBox.x - 15, invBox.y, {steps:3});
    await page.waitForTimeout(50);
    await page.screenshot({ path: `shot20_${scheme}_01_drag_start.png` });
    await page.mouse.move(balBox.x - 3, balBox.y, {steps:8});
    await page.waitForTimeout(80);
    await page.screenshot({ path: `shot20_${scheme}_02_mid_drag.png` });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const subtabsAfter = await page.$$eval('[data-resumen-sub]', els => els.map(e=>e.getAttribute('data-resumen-sub')));
    console.log(scheme, 'order after:', subtabsAfter);
    await page.screenshot({ path: `shot20_${scheme}_03_after_drag.png` });

    const activeSub = await page.$eval('.subtab.active', el => el.getAttribute('data-resumen-sub'));
    console.log(scheme, 'active sub after drag (expect unchanged=inversiones):', activeSub);

    // plain tap still works?
    await page.click('[data-resumen-sub="' + subtabsAfter[0] + '"]');
    await page.waitForTimeout(150);
    const activeSub2 = await page.$eval('.subtab.active', el => el.getAttribute('data-resumen-sub'));
    console.log(scheme, 'tap on first pill selects it:', activeSub2 === subtabsAfter[0]);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
