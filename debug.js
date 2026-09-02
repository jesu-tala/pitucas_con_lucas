const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 900, height: 950 } });
  await page.goto('file://' + path.join(__dirname, 'test.html'));
  await page.waitForTimeout(300);
  const tx = await page.$('button[data-tx="t5"]');
  await tx.click();
  await page.waitForTimeout(300);
  const link = await page.$('[data-toggle-cobrosplit]');
  if (link) { await link.click(); await page.waitForTimeout(200); }
  await page.screenshot({ path: 'debug_shot.png' });
  const info = await page.evaluate(() => {
    const sc = document.getElementById('sheet-content');
    return {
      scrollTop: sc.scrollTop,
      scrollHeight: sc.scrollHeight,
      clientHeight: sc.clientHeight,
      html: sc.innerHTML.slice(0, 700)
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
