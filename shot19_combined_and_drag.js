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
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(250);

    // scroll to banco de chile combined summary
    await page.evaluate(() => {
      const nodes = document.querySelectorAll('.platform-name');
      for (const n of nodes) { if (n.textContent.includes('Banco de Chile')) { n.closest('.platform-group').scrollIntoView({block:'start'}); break; } }
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot19_${scheme}_combined_summary.png` });
    const summaryText = await page.$eval('.platform-meta-summary', el => el.textContent).catch(()=>null);
    console.log(scheme, 'combined summary text:', summaryText);

    // test drag-and-drop reorder of subtabs: drag "Inversiones" pill before "Balance"
    const subtabsBefore = await page.$$eval('[data-resumen-sub]', els => els.map(e=>e.getAttribute('data-resumen-sub')));
    console.log(scheme, 'subtab order before drag:', subtabsBefore);

    const invBox = await page.$eval('[data-resumen-sub="inversiones"]', el => { const r = el.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });
    const balBox = await page.$eval('[data-resumen-sub="balance"]', el => { const r = el.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });

    await page.mouse.move(invBox.x, invBox.y);
    await page.mouse.down();
    await page.mouse.move(invBox.x - 20, invBox.y, {steps:3});
    await page.mouse.move(balBox.x - 5, balBox.y, {steps:5});
    await page.waitForTimeout(100);
    await page.screenshot({ path: `shot19_${scheme}_mid_drag.png` });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const subtabsAfter = await page.$$eval('[data-resumen-sub]', els => els.map(e=>e.getAttribute('data-resumen-sub')));
    console.log(scheme, 'subtab order after drag:', subtabsAfter);
    await page.screenshot({ path: `shot19_${scheme}_after_drag.png` });

    // confirm the currently-visible sub view did NOT change (was inversiones, should stay inversiones)
    const activeSub = await page.$eval('.subtab.active', el => el.getAttribute('data-resumen-sub'));
    console.log(scheme, 'active sub after drag (should still be inversiones):', activeSub);

    // now confirm a plain tap still works (click balance)
    await page.click('[data-resumen-sub="balance"]');
    await page.waitForTimeout(150);
    const activeSub2 = await page.$eval('.subtab.active', el => el.getAttribute('data-resumen-sub'));
    console.log(scheme, 'active sub after plain tap on balance:', activeSub2);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
