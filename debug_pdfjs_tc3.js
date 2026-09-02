const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 420, height: 950 } })).newPage();
  await page.goto('file://' + path.join(__dirname, 'test_debug.html'));
  await page.evaluate(() => { const g = document.getElementById('auth-gate'); if (g) g.hidden = true; });
  await page.evaluate(() => { if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; });
  await page.waitForTimeout(300);
  const buf = fs.readFileSync(path.join(__dirname, 'cartola_visa_dec.pdf'));
  const b64 = buf.toString('base64');
  const allWords = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: arr }).promise;
    let all = [];
    for (let p=1;p<=pdf.numPages;p++){
      const pg = await pdf.getPage(p);
      const viewport = pg.getViewport({ scale: 1 });
      const content = await pg.getTextContent();
      content.items.filter(it => it.str.trim()).forEach(it => all.push({ page:p, text: it.str, x0: it.transform[4], top: viewport.height - it.transform[5] }));
    }
    return all;
  }, b64);
  const mc = allWords.filter(w => /MONTO CANCELADO/i.test(w.text));
  mc.forEach(m => {
    const rowWords = allWords.filter(w => w.page===m.page && Math.abs(w.top - m.top) <= 5).sort((a,b)=>a.x0-b.x0);
    console.log('--- row on page', m.page, 'top', m.top, '---');
    console.log(JSON.stringify(rowWords));
  });
  await browser.close();
})();
