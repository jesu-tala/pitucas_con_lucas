const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 900, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message + '\n' + err.stack));

    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);
    await page.click('#fab-add');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shot8_${scheme}_01_new_tx.png` });

    await page.selectOption('[data-draft-field="medio"]', '__nuevo_medio__');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot8_${scheme}_02_add_medio_form.png` });

    await page.fill('[data-new-medio-field="nombre"]', 'Visa Falabella');
    await page.fill('[data-new-medio-field="ultimos4"]', '7788');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot8_${scheme}_03_form_filled.png` });

    await page.click('[data-save-new-medio]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `shot8_${scheme}_04_after_add.png` });

    const medioValue = await page.$eval('[data-draft-field="medio"]', el => el.value);
    const medioOptionsText = await page.$$eval('[data-draft-field="medio"] option', opts => opts.map(o => o.textContent));
    console.log(scheme, 'selected medio value:', medioValue);
    console.log(scheme, 'medio options:', medioOptionsText);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
