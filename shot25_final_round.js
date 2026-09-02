const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light','dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 1200 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message + '\n' + err.stack));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('TUNNEL')) errors.push(msg.text()); });
    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);

    // Inversiones top: objetivo + proyeccion cards
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `shot25_${scheme}_01_inversiones_top.png` });

    // banco de chile combined summary with %
    await page.evaluate(() => {
      const nodes = document.querySelectorAll('.platform-name');
      for (const n of nodes) { if (n.textContent.includes('Banco de Chile')) { n.closest('.platform-group').scrollIntoView({block:'start'}); break; } }
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot25_${scheme}_02_banco_chile.png` });
    const summaryFigsText = await page.$eval('.platform-meta-summary-figs', el => el.textContent).catch(()=>null);
    console.log(scheme, 'combined figs (should include %):', summaryFigsText);

    // fintual: edit and set a comision, verify display
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(100);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(200);
    await page.click('[data-edit-platform="fintual"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot25_${scheme}_03_fintual_edit_comision.png` });
    await page.fill('[data-platform-field="comision"]', '1.1');
    await page.click('[data-save-platform="fintual"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot25_${scheme}_04_fintual_comision_saved.png` });
    const comisionText = await page.$eval('.platform-comision-row', el => el.textContent).catch(()=>null);
    console.log(scheme, 'comision row text:', comisionText);

    // Menu roadmap
    await page.click('[data-tab="menu"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot25_${scheme}_05_menu.png` });

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
