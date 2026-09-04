// Bug found: when uploading a statement PDF directly with "Elegir archivo PDF" (as
// opposed to ones that arrive automatically by email), if the PDF was password-protected the app threw a
// generic error ("No se pudo leer el archivo: PDF_PASSWORD_REQUERIDA") with no way to enter
// the password -- the user was permanently stuck with that statement. The ones that arrive by
// email (useImportedStatement) already had a field to ask for the password and retry; this test
// checks that direct upload now does the same (tryOpenStatementFile).
const { openApp, check, finish } = require('./lib/test_kit');
const path = require('path');

(async () => {
  const { context, browser, page, errors } = await openApp();
  await page.evaluate(() => {
    if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
  });

  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="reconciliar"]');
  await page.waitForTimeout(150);

  // Upload the encrypted card PDF (real password: 1196) directly via "Elegir archivo PDF".
  const fileInput = await page.$('[data-reconcile-file-input]');
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'cartola_visa_enc.pdf'));
  await page.waitForTimeout(1500);

  const trasSubir = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return {
      error: R.error,
      errorPassword: R.errorPassword,
      nombrePendiente: R.archivoNombrePendiente,
      hayInputClave: !!document.querySelector('[data-statement-password-input]'),
      hayBotonAbrir: !!document.querySelector('[data-reconcile-file-open]'),
    };
  });
  check('No queda en el error genérico de siempre (se detecta que pide clave)', !trasSubir.error, trasSubir);
  check('Aparece el campo para escribir la clave del PDF', trasSubir.hayInputClave && trasSubir.hayBotonAbrir, trasSubir);
  check('Guarda el nombre del archivo pendiente de clave', trasSubir.nombrePendiente === 'cartola_visa_enc.pdf', trasSubir);
  check('Muestra "Este PDF pide una clave" (primer intento, sin clave todavía)', trasSubir.errorPassword === 'Este PDF pide una clave.', trasSubir.errorPassword);

  // Test with an incorrect password first -- it should keep asking for the password, without losing the file.
  await page.fill('[data-statement-password-input]', '0000');
  await page.click('[data-reconcile-file-open]');
  await page.waitForTimeout(1200);
  const claveMala = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return { errorPassword: R.errorPassword, nombrePendiente: R.archivoNombrePendiente, movimientos: R.movimientos.length };
  });
  check('Con clave incorrecta, avisa que no abrió y sigue pidiendo la clave (no se pierde el archivo)', claveMala.errorPassword === 'Esa clave no abrió el archivo — pruébala de nuevo.' && claveMala.nombrePendiente === 'cartola_visa_enc.pdf' && claveMala.movimientos === 0, claveMala);

  // Now with the correct password.
  await page.fill('[data-statement-password-input]', '1196');
  await page.click('[data-reconcile-file-open]');
  await page.waitForTimeout(1200);
  const claveBuena = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return { tipo: R.tipo, n: R.movimientos.length, archivo: R.archivo, nombrePendiente: R.archivoNombrePendiente, error: R.error, errorPassword: R.errorPassword };
  });
  check('Con la clave correcta, se lee el PDF y quedan los movimientos (mismo resultado que la copia sin clave, 47)', claveBuena.tipo === 'tarjeta_nacional' && claveBuena.n === 47, claveBuena);
  check('Guarda el nombre del archivo ya leído', claveBuena.archivo === 'cartola_visa_enc.pdf', claveBuena);
  check('Ya no queda nada pendiente de clave', claveBuena.nombrePendiente === null && !claveBuena.error && !claveBuena.errorPassword, claveBuena);

  // "Cancelar" on the password field: it must not leave anything open or throw an error.
  await page.click('[data-reconcile-reset]');
  await page.waitForTimeout(150);
  const fileInput2 = await page.$('[data-reconcile-file-input]');
  await fileInput2.setInputFiles(path.join(__dirname, 'fixtures', 'cartola_visa_enc.pdf'));
  await page.waitForTimeout(1500);
  await page.click('[data-reconcile-file-cancel]');
  await page.waitForTimeout(150);
  const cancelado = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return { nombrePendiente: R.archivoNombrePendiente, hayInputClave: !!document.querySelector('[data-statement-password-input]'), hayCardArchivo: !!document.querySelector('[data-reconcile-file-input]') };
  });
  check('"Cancelar" cierra el campo de clave y vuelve a la pantalla de elegir archivo', !cancelado.nombrePendiente && !cancelado.hayInputClave && cancelado.hayCardArchivo, cancelado);

  await finish({ context, browser, errors });
})();
