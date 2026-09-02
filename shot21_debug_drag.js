const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 420, height: 950 } });
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('file://' + path.join(__dirname, 'test.html'));
  await page.waitForTimeout(300);
  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    document.addEventListener('click', e => {
      const p = e.target.closest('[data-resumen-sub]');
      console.log('CLICK EVENT fired, target sub=', p ? p.getAttribute('data-resumen-sub') : null, 'defaultPrevented=', e.defaultPrevented);
    }, true);
    document.addEventListener('pointerup', e => console.log('POINTERUP at', e.clientX, e.clientY), true);
  });

  const invBox = await page.$eval('[data-resumen-sub="inversiones"]', el => { const r = el.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });
  const balBox = await page.$eval('[data-resumen-sub="balance"]', el => { const r = el.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });

  await page.mouse.move(invBox.x, invBox.y);
  await page.mouse.down();
  await page.mouse.move(invBox.x - 15, invBox.y, {steps:3});
  await page.mouse.move(balBox.x - 3, balBox.y, {steps:8});
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(150);

  const subtabsAfter = await page.$$eval('[data-resumen-sub]', els => els.map(e=>e.getAttribute('data-resumen-sub')));
  console.log('order after:', subtabsAfter);
  const activeSub = await page.$eval('.subtab.active', el => el.getAttribute('data-resumen-sub'));
  console.log('active after drag:', activeSub);

  await browser.close();
})();
