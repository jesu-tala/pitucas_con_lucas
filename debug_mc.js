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
  const res = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const r = await window.__debug.parseCartolaPDF(arr.buffer);
    return { tipo: r.tipo, n: r.movimientos.length, pagoRecibido: r.movimientos.filter(m=>m.esEspecial==='pago_recibido'), sample: r.movimientos.slice(0,5) };
  }, b64);
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})();
