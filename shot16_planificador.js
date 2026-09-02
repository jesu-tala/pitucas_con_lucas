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
    await page.screenshot({ path: `shot16_${scheme}_01_base.png` });

    // read initial computed amount for vivir (fijo idx 0, 48% of 2559274)
    const vivirAmt = await page.$eval('[data-plan-amt="fijo-0"]', el => el.textContent);
    console.log(scheme, 'vivir amt initial:', vivirAmt);

    // change base total
    await page.fill('[data-plan-base-input]', '3000000');
    await page.waitForTimeout(150);
    const vivirAmtAfter = await page.$eval('[data-plan-amt="fijo-0"]', el => el.textContent);
    console.log(scheme, 'vivir amt after base change to 3,000,000:', vivirAmtAfter);
    await page.screenshot({ path: `shot16_${scheme}_02_base_changed.png` });

    // change a pct to break 100%
    const pctInputs = await page.$$('[data-plan-pct][data-plan-group="fijo"]');
    await pctInputs[0].fill('60');
    await page.waitForTimeout(150);
    const pillTxt = await page.$eval('[data-plan-total-txt]', el => el.textContent);
    const pillClass = await page.$eval('[data-plan-total-pill]', el => el.className);
    console.log(scheme, 'pill after overallocation:', pillTxt, pillClass);
    await page.screenshot({ path: `shot16_${scheme}_03_overallocated.png` });

    // scroll to invest sub-split + widgets
    await page.evaluate(() => { document.querySelector('.plan-invest-card').scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot16_${scheme}_04_invest_split.png` });

    await page.evaluate(() => { document.querySelector('.plan-widgets').scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot16_${scheme}_05_widgets.png` });

    // change dividendo
    await page.fill('[data-plan-div-input]', '500000');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot16_${scheme}_06_dividendo_changed.png` });

    await page.evaluate(() => { document.querySelector('.plan-notes').scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot16_${scheme}_07_notes_footer.png` });

    // reset
    await page.click('[data-plan-reset]');
    await page.waitForTimeout(200);
    const vivirAmtReset = await page.$eval('[data-plan-amt="fijo-0"]', el => el.textContent);
    console.log(scheme, 'vivir amt after reset:', vivirAmtReset);

    // confirm subtabs survived through all this
    const subtabs = await page.$$eval('[data-resumen-sub]', els => els.length);
    console.log(scheme, 'subtabs after reset:', subtabs);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
