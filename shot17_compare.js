const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 1200 }, colorScheme: scheme });
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
    await page.screenshot({ path: `shot17_${scheme}_full.png`, fullPage: true });

    // scroll to banco de chile nested goals specifically
    await page.evaluate(() => {
      const nodes = document.querySelectorAll('.platform-name');
      for (const n of nodes) { if (n.textContent.includes('Banco de Chile')) { n.closest('.platform-group').scrollIntoView({block:'start'}); break; } }
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot17_${scheme}_banco_chile.png` });

    // test adding a new meta under banco de chile
    await page.evaluate(() => {
      const nodes = document.querySelectorAll('[data-add-meta]');
      for (const n of nodes) { if (n.getAttribute('data-add-meta') === 'banco_chile') { n.scrollIntoView({block:'center'}); n.click(); break; } }
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot17_${scheme}_add_meta_form.png` });
    const ctxLabel = await page.$eval('.meta-goal-ctx', el => el.textContent).catch(()=>null);
    console.log(scheme, 'add-meta context label:', ctxLabel);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
