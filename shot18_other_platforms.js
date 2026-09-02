const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto('file://' + path.join(__dirname, 'test.html'));
  await page.waitForTimeout(300);
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-resumen-sub="inversiones"]');
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    const nodes = document.querySelectorAll('.platform-name');
    for (const n of nodes) { if (n.textContent.includes('Racional')) { n.closest('.platform-group').scrollIntoView({block:'start'}); break; } }
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `shot18_racional_buda.png`, fullPage:false });
  await context.close();
  await browser.close();
})();
