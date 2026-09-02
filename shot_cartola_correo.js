const { openApp, check, finish } = require('./lib/test_kit');
const path = require('path');
const fs = require('fs');

(async () => {
  const { context, browser, page, errors } = await openApp();
  await page.evaluate(() => { if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; });

  // 1) parseCartolaPDF con un PDF cifrado real (la copia ORIGINAL, todavía con la clave del
  //    banco puesta — la misma que llegaría guardada tal cual desde el correo).
  const bufEnc = fs.readFileSync(path.join(__dirname, 'cartola_visa_enc.pdf'));
  const b64Enc = bufEnc.toString('base64');

  const sinClave = await page.evaluate(async (b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    try { await window.__debug.parseCartolaPDF(arr.buffer); return 'no lanzó error (mal)'; }
    catch(e){ return e.message; }
  }, b64Enc);
  check('Sin clave, lanza PDF_PASSWORD_REQUERIDA', sinClave === 'PDF_PASSWORD_REQUERIDA', sinClave);

  const claveMala = await page.evaluate(async (b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    try { await window.__debug.parseCartolaPDF(arr.buffer, '0000'); return 'no lanzó error (mal)'; }
    catch(e){ return e.message; }
  }, b64Enc);
  check('Con clave mala, también PDF_PASSWORD_REQUERIDA', claveMala === 'PDF_PASSWORD_REQUERIDA', claveMala);

  const claveBuena = await page.evaluate(async (b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    const res = await window.__debug.parseCartolaPDF(arr.buffer, '1196');
    return { tipo: res.tipo, n: res.movimientos.length };
  }, b64Enc);
  console.log('Con la clave correcta (1196), se lee el PDF cifrado:', JSON.stringify(claveBuena));
  check('tipo === tarjeta_nacional', claveBuena.tipo === 'tarjeta_nacional');
  check('mismo número de movimientos que la copia ya descifrada (47)', claveBuena.n === 47, claveBuena.n);

  // 2) pgBytesToArrayBuffer: el mismo PDF, como vendría de Supabase en formato hex "\x...".
  const hexOk = await page.evaluate((b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    let hex = '\\x';
    for (let i=0;i<bytes.length;i++) hex += bytes[i].toString(16).padStart(2,'0');
    const buf = window.__debug.pgBytesToArrayBuffer ? window.__debug.pgBytesToArrayBuffer(hex) : null;
    if(!buf) return 'pgBytesToArrayBuffer no está expuesta en __debug';
    const back = new Uint8Array(buf);
    return back.length === bytes.length && back.every((v,i)=>v===bytes[i]);
  }, b64Enc);
  check('pgBytesToArrayBuffer reconstruye los bytes exactos desde el formato hex de Postgres', hexOk);

  // 3) UI: renderCartolasDisponiblesBlock — se prueba fijando el estado a mano (sin red real),
  //    ya que "sb" es una conexión real a Supabase y no se puede simular en este sandbox.
  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(120);
  await page.click('[data-menu-open="reconciliar"]');
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    window.__debug.state.reconciliar.disponibles = [
      {id:'c1', tipo:'cuenta_corriente', nombre_archivo:'cartola.pdf', recibido_en:'2026-08-04T23:40:00Z'},
      {id:'c2', tipo:'tarjeta_nacional', nombre_archivo:'edo_cuenta.pdf', recibido_en:'2026-08-27T10:20:00Z'}
    ];
    window.__debug.render();
  });
  await page.waitForTimeout(120);
  const listado = await page.evaluate(() => Array.from(document.querySelectorAll('.section-title')).some(e => e.textContent.includes('Llegaron solas por correo')));
  check('Aparece la sección "Llegaron solas por correo"', listado);
  const botonesUsar = await page.evaluate(() => document.querySelectorAll('[data-cartola-usar]').length);
  check('Hay un botón "Usar esta" por cada cartola disponible (esperado 2)', botonesUsar === 2, botonesUsar);

  await page.click('[data-cartola-usar="c2"]');
  await page.waitForTimeout(120);
  const promptVisible = await page.evaluate(() => !!document.querySelector('[data-cartola-password-input]'));
  check('Al apretar "Usar esta" aparece el campo para la clave', promptVisible);
  await page.fill('[data-cartola-password-input]', '9999');
  const draftGuardado = await page.evaluate(() => window.__debug.state.reconciliar.passwordDraft);
  check('Lo que escribes en la clave se guarda en el draft (sin loguearlo en ningún lado)', draftGuardado === '9999');

  await page.click('[data-cartola-cancelar]');
  await page.waitForTimeout(120);
  const promptCerrado = await page.evaluate(() => !document.querySelector('[data-cartola-password-input]') && window.__debug.state.reconciliar.usandoId===null);
  check('"Cancelar" cierra el campo de clave sin dejar nada abierto', promptCerrado);

  await finish({ context, browser, errors });
})();
