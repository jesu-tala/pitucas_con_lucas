// Feature: "sacarle una foto a la boleta o subirla de la galería y que se transcriba para
// poder dividirla" -- hasta ahora el paso de "Escanear boleta" era una maqueta (RECEIPT_EXAMPLES
// en sheet.ts): apretar cualquiera de los dos botones simulaba el resultado con una boleta de
// ejemplo fija, sin tocar ninguna foto real. Ahora hay inputs de archivo reales (cámara/galería)
// que mandan la foto a un Cloudflare Worker (backend/cloudflare-worker-ocr/), que a su vez la
// manda al parser de boletas de Google Document AI y devuelve los items ya separados.
// Como ese Worker real no puede llamarse desde este sandbox (ni tiene sentido depender de
// Document AI real para un test), se reemplaza window.fetch para simular sus 3 respuestas
// posibles (éxito, error del Worker, Worker sin configurar) -- lo que SÍ se prueba de verdad es
// el flujo completo de la app: seleccionar un archivo real en el <input type="file"> (Playwright
// lo sube de verdad), que dispara el mismo código que corre en el celular (achicar la foto a
// base64 vía canvas, mandarla, y poblar los items con lo que responda).
const path = require('path');
const { openApp, check, finish } = require('./lib/test_kit');

const IMG_FIXTURE = path.join(__dirname, 'fixtures', 'boleta_ejemplo.png');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push({
      id: 'tx-boleta-1', fecha: '2026-09-08', hora: '20:00', comercio: 'Sushi Itto Providencia',
      monto: 39600, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'restoranes', monto: 39600 }], porCobrar: []
    });
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  // ---------- Caso 1: el Worker responde bien con items reales ----------
  await page.evaluate(() => {
    const D = window.__debug;
    // leerBoletaConOCR() exige tener sesión/hogar antes de llamar al Worker (mismo requisito
    // que sendTestPush/enviarPushHogar) -- este sandbox nunca inicia sesión de verdad, así que
    // se simulan directo para poder probar el resto del flujo.
    D.currentHouseholdId = 'test-household';
    D.state.importToken = 'test-token';
    D.OCR_WORKER_URL = 'https://fake-ocr-worker.test';
    const original = window.fetch.bind(window);
    window.fetch = function(url, opts){
      if (String(url).includes('fake-ocr-worker.test/leer-boleta')) {
        window.__lastFetchBody = JSON.parse(opts.body);
        return Promise.resolve(new Response(JSON.stringify({
          comercio: 'Sushi Itto Providencia',
          items: [{ nombre: 'Roll California x2', monto: 14000 }, { nombre: 'Sashimi mixto', monto: 16000 }, { nombre: 'Bebidas (3)', monto: 6000 }]
        }), { status: 200 }));
      }
      return original(url, opts);
    };
    D.openReceiptFlow('tx-boleta-1');
  });
  await page.waitForTimeout(150);

  const capturaHtml = await page.evaluate(() => document.getElementById('sheet-content').innerHTML);
  check('El paso de captura ya NO dice que es una maqueta simulada', !/simula|maqueta/i.test(capturaHtml), capturaHtml.slice(0, 300));
  check('Hay inputs de archivo reales para cámara y galería (accept image/*)',
    (capturaHtml.match(/data-receipt-file-input/g) || []).length === 2 && capturaHtml.includes('accept="image/*"'), capturaHtml);

  // Sube el archivo real en el input de "galería" (el segundo de los dos data-receipt-file-input).
  const galeriaInput = page.locator('label:has-text("Elegir de galería") input[data-receipt-file-input]');
  await galeriaInput.setInputFiles(IMG_FIXTURE);
  await page.waitForTimeout(400);

  const trasSubir = await page.evaluate(() => ({
    step: window.__debug.state.boleta && window.__debug.state.boleta.step,
    items: window.__debug.state.boleta ? window.__debug.state.boleta.items.map(i => ({ nombre: i.nombre, monto: i.monto })) : null,
    comercio: window.__debug.state.boleta ? window.__debug.state.boleta.comercio : null,
    mandoBase64: !!(window.__lastFetchBody && typeof window.__lastFetchBody.image_base64 === 'string' && window.__lastFetchBody.image_base64.length > 0),
    mandoHouseholdYToken: !!(window.__lastFetchBody && 'household_id' in window.__lastFetchBody && 'token' in window.__lastFetchBody),
  }));
  check('Tras subir la foto, pasa directo al paso de items (sin que ella toque nada)', trasSubir.step === 'items', trasSubir);
  check('   con los 3 items reales que devolvió el Worker (no la boleta de ejemplo vieja)',
    trasSubir.items && trasSubir.items.length === 3 && trasSubir.items[0].nombre === 'Roll California x2' && trasSubir.items[0].monto === 14000, trasSubir);
  check('   la foto se mandó como base64 en el body del POST', trasSubir.mandoBase64, trasSubir);
  check('   junto con el household_id y el token del hogar (para que el Worker valide)', trasSubir.mandoHouseholdYToken, trasSubir);

  // ---------- Caso 2: el Worker responde con un error -> cae a agregar items a mano ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.openTxId = null; D.state.boleta = null; D.render();
    window.fetch = function(url, opts){
      if (String(url).includes('fake-ocr-worker.test/leer-boleta')) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'no se encontraron items en la foto' }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    D.openReceiptFlow('tx-boleta-1');
  });
  await page.waitForTimeout(150);
  const galeriaInput2 = page.locator('label:has-text("Elegir de galería") input[data-receipt-file-input]');
  await galeriaInput2.setInputFiles(IMG_FIXTURE);
  await page.waitForTimeout(400);
  const trasError = await page.evaluate(() => ({
    step: window.__debug.state.boleta && window.__debug.state.boleta.step,
    items: window.__debug.state.boleta ? window.__debug.state.boleta.items.length : null,
    toast: document.getElementById('toast-stack').textContent,
  }));
  check('Si el Worker no encuentra items, igual la deja en el paso de items (para agregarlos a mano)', trasError.step === 'items' && trasError.items === 0, trasError);
  check('   avisando con un toast explícito (nunca en silencio)', /no se encontraron items/i.test(trasError.toast), trasError);

  // ---------- Caso 3: el Worker todavía no está configurado (placeholder) ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.openTxId = null; D.state.boleta = null; D.render();
    D.OCR_WORKER_URL = 'PEGA_AQUI_LA_URL_DE_TU_WORKER_DE_BOLETAS';
    D.openReceiptFlow('tx-boleta-1');
  });
  await page.waitForTimeout(150);
  const sinConfigurarHtml = await page.evaluate(() => document.getElementById('sheet-content').textContent);
  check('Si el Worker no está configurado, la hoja de captura lo dice explícitamente', /falta terminar de configurar/i.test(sinConfigurarHtml), sinConfigurarHtml);

  const galeriaInput3 = page.locator('label:has-text("Elegir de galería") input[data-receipt-file-input]');
  await galeriaInput3.setInputFiles(IMG_FIXTURE);
  await page.waitForTimeout(400);
  const trasNoConfigurado = await page.evaluate(() => ({
    step: window.__debug.state.boleta && window.__debug.state.boleta.step,
    toast: document.getElementById('toast-stack').textContent,
  }));
  check('   y al intentar subir una foto igual, avisa y cae a agregar items a mano', trasNoConfigurado.step === 'items' && /falta terminar de configurar/i.test(trasNoConfigurado.toast), trasNoConfigurado);

  // ---------- "Prefiero agregar los items a mano" desde el paso de captura ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.openTxId = null; D.state.boleta = null; D.render();
    D.openReceiptFlow('tx-boleta-1');
  });
  await page.waitForTimeout(150);
  await page.click('[data-receipt-goto="items"]');
  await page.waitForTimeout(150);
  const manoDirecto = await page.evaluate(() => window.__debug.state.boleta.step);
  check('El botón "Prefiero agregar los items a mano" salta directo a items sin pasar por el Worker', manoDirecto === 'items', manoDirecto);

  await finish({ context, browser, errors });
})();
