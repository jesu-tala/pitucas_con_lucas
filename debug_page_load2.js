const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 420, height: 950 } });
  const page = await context.newPage();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  page.on('console', msg => console.log(msg.type().toUpperCase() + ':', msg.text()));
  page.on('requestfailed', req => console.log('REQFAILED:', req.url(), req.failure() && req.failure().errorText));
  await page.goto('file://' + path.join(__dirname, 'test_debug.html'));
  await page.waitForTimeout(1000);
  const full = await page.content();
  fs.writeFileSync(path.join(__dirname, 'dumped_body.html'), full);
  console.log('dumped length', full.length);
  const hasDebug = await page.evaluate(() => typeof window.__debug);
  console.log('window.__debug type:', hasDebug);
  const hasPdfjs = await page.evaluate(() => typeof window.pdfjsLib);
  console.log('window.pdfjsLib type:', hasPdfjs);
  await context.close();
  await browser.close();
})();
