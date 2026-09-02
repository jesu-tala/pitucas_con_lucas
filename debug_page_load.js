const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 420, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message + '\n' + err.stack));
  page.on('console', msg => errors.push(msg.type().toUpperCase() + ': ' + msg.text()));

  await page.goto('file://' + path.join(__dirname, 'test_debug.html'));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = document.getElementById('auth-gate'); if (g) g.hidden = true; });
  await page.waitForTimeout(500);

  console.log('--- console/page errors so far ---');
  console.log(errors.join('\n'));

  const tabExists = await page.$('[data-tab="menu"]');
  console.log('tab menu element exists in DOM:', tabExists !== null);
  if (tabExists) {
    const box = await tabExists.boundingBox();
    console.log('bounding box:', JSON.stringify(box));
    const visible = await tabExists.isVisible();
    console.log('isVisible:', visible);
  }

  const bodyHTML = await page.evaluate(() => document.body.innerHTML.length);
  console.log('body innerHTML length:', bodyHTML);

  const rootHTML = await page.evaluate(() => {
    const el = document.querySelector('.app, #app, [data-tab="menu"]');
    return el ? 'found some root marker' : document.body.innerHTML.slice(0, 500);
  });
  console.log('root check:', rootHTML);

  await context.close();
  await browser.close();
})();
