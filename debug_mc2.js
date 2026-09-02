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
  const buf = fs.readFileSync(path.join(__dirname, 'cartola_mc_dec.pdf'));
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
  // dump rows for page 2 (where purchases usually start), first ~30 words sorted by top then x0
  const p2 = allWords.filter(w=>w.page===2).sort((a,b)=> a.top-b.top || a.x0-b.x0).slice(0,40);
  p2.forEach(w => console.log(w.top.toFixed(1).padStart(7), w.x0.toFixed(1).padStart(7), JSON.stringify(w.text)));
  await browser.close();
})();
