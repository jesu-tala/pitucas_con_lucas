const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 420, height: 950 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
  await page.goto('file://' + path.join(__dirname, 'preview', 'preview.html'));
  await page.waitForTimeout(800);
  const visible = await page.evaluate(() => {
    const gate = document.getElementById('auth-gate');
    const tabbar = document.getElementById('tabbar');
    return { gateHidden: gate.hidden, tabbarHTML: tabbar.innerHTML.length, txCount: document.querySelectorAll('.tx-item').length };
  });
  console.log(JSON.stringify(visible));
  console.log('ERRORS:', JSON.stringify(errors));
  await browser.close();
})();
