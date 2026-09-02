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
  const rows = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: arr }).promise;
    const page1 = await pdf.getPage(1);
    const viewport = page1.getViewport({ scale: 1 });
    const content = await page1.getTextContent();
    const words = content.items.filter(it => it.str.trim()).map(it => ({ text: it.str, x0: it.transform[4], top: viewport.height - it.transform[5] }));
    return { height: viewport.height, numPages: pdf.numPages, words };
  }, b64);
  console.log('viewport height:', rows.height, 'numPages:', rows.numPages);
  // buscar filas que contengan un $ (movimientos) y UBER
  rows.words.filter(w => /UBER|MONTO CANCELADO|\$/.test(w.text)).slice(0,40).forEach(w => console.log(w.top.toFixed(1).padStart(7), w.x0.toFixed(1).padStart(7), JSON.stringify(w.text)));
  await browser.close();
})();
