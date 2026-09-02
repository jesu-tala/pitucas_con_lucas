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

    await page.evaluate(() => { document.querySelector('.plan-base-card').scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot30_${scheme}_01_base.png`, fullPage: false });

    const baseVal = await page.$eval('[data-plan-base-input]', el => el.value);
    const baseHint = await page.$eval('.plan-base-hint', el => el.textContent);
    console.log(scheme, 'base default value:', baseVal, '| hint:', baseHint);

    // check no fijo/kayna/depto/notes remnants
    const hasFijo = await page.evaluate(() => document.body.textContent.includes('Fijo · sale siempre'));
    const hasKayna = await page.evaluate(() => document.body.textContent.includes('Kayna'));
    const hasDepto = await page.evaluate(() => document.body.textContent.includes('Ledger del depto'));
    const hasNotes = await page.evaluate(() => document.body.textContent.includes('Lo que tienes que tener presente'));
    console.log(scheme, 'has Fijo block (expect false):', hasFijo, '| has Kayna (expect false):', hasKayna, '| has Depto ledger (expect false):', hasDepto, '| has notes card (expect false):', hasNotes);

    // groups present
    const groupHeads = await page.$$eval('.plan-block-head', els => els.map(e=>e.textContent.trim()));
    console.log(scheme, 'group heads:', JSON.stringify(groupHeads));

    await page.evaluate(() => { document.querySelector('.plan-cols').scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot30_${scheme}_02_groups.png`, fullPage: true });

    // edit a meta pct (fondo de emergencia, corto plazo)
    const firstMetaPct = await page.$('[data-plan-meta-pct]');
    if (firstMetaPct) {
      const metaId = await firstMetaPct.evaluate(el => el.getAttribute('data-plan-meta-id'));
      await firstMetaPct.fill('25');
      await page.waitForTimeout(150);
      const amt = await page.$eval(`[data-plan-meta-amt="${metaId}"]`, el => el.textContent);
      console.log(scheme, 'meta amt after setting 25%:', amt);
      const groupPctTxt = await page.$eval('[data-plan-group-pct="corto"]', el => el.textContent).catch(()=>null);
      console.log(scheme, 'corto group pct after edit:', groupPctTxt);
    }

    // change base, verify amounts recompute
    await page.fill('[data-plan-base-input]', '1000000');
    await page.waitForTimeout(150);
    const totalPillTxt = await page.$eval('[data-plan-total-txt]', el => el.textContent);
    console.log(scheme, 'pill after base change to 1,000,000:', totalPillTxt);
    await page.screenshot({ path: `shot30_${scheme}_03_base_changed.png` });

    // invest sub-split card (largo plazo)
    await page.evaluate(() => { document.querySelector('.plan-invest-card').scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    const investBase = await page.$eval('[data-plan-invest-base]', el => el.textContent);
    console.log(scheme, 'invest base (largo plazo subtotal, expect $0 since no largo metas):', investBase);
    await page.screenshot({ path: `shot30_${scheme}_04_invest.png` });

    // reset
    await page.click('[data-plan-reset]');
    await page.waitForTimeout(200);
    const baseAfterReset = await page.$eval('[data-plan-base-input]', el => el.value);
    console.log(scheme, 'base after reset:', baseAfterReset);

    // confirm subtabs survived
    const subtabs = await page.$$eval('[data-resumen-sub]', els => els.length);
    console.log(scheme, 'subtabs after reset:', subtabs);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
