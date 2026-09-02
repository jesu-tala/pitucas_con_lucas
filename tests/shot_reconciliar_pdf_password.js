// Bug encontrado: al subir un PDF de cartola directamente con "Elegir archivo PDF" (a
// diferencia de las que llegan solas por correo), si el PDF tenía clave la app tiraba un error
// genérico ("No se pudo leer el archivo: PDF_PASSWORD_REQUERIDA") sin ninguna forma de escribir
// la clave — la usuaria quedaba bloqueada para siempre con esa cartola. Las que llegan por
// correo (usarCartolaImportada) ya tenían un campo para pedir la clave y reintentar; este test
// prueba que la subida directa ahora hace lo mismo (intentarAbrirArchivoCartola).
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

  // Sube el PDF de tarjeta cifrado (clave real: 1196) directo por "Elegir archivo PDF".
  const fileInput = await page.$('[data-reconciliar-file-input]');
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'cartola_visa_enc.pdf'));
  await page.waitForTimeout(1500);

  const trasSubir = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return {
      error: R.error,
      errorPassword: R.errorPassword,
      nombrePendiente: R.archivoNombrePendiente,
      hayInputClave: !!document.querySelector('[data-cartola-password-input]'),
      hayBotonAbrir: !!document.querySelector('[data-reconciliar-archivo-abrir]'),
    };
  });
  check('No queda en el error genérico de siempre (se detecta que pide clave)', !trasSubir.error, trasSubir);
  check('Aparece el campo para escribir la clave del PDF', trasSubir.hayInputClave && trasSubir.hayBotonAbrir, trasSubir);
  check('Guarda el nombre del archivo pendiente de clave', trasSubir.nombrePendiente === 'cartola_visa_enc.pdf', trasSubir);
  check('Muestra "Este PDF pide una clave" (primer intento, sin clave todavía)', trasSubir.errorPassword === 'Este PDF pide una clave.', trasSubir.errorPassword);

  // Prueba con una clave incorrecta primero — debe seguir pidiendo la clave, sin perder el archivo.
  await page.fill('[data-cartola-password-input]', '0000');
  await page.click('[data-reconciliar-archivo-abrir]');
  await page.waitForTimeout(1200);
  const claveMala = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return { errorPassword: R.errorPassword, nombrePendiente: R.archivoNombrePendiente, movimientos: R.movimientos.length };
  });
  check('Con clave incorrecta, avisa que no abrió y sigue pidiendo la clave (no se pierde el archivo)', claveMala.errorPassword === 'Esa clave no abrió el archivo — pruébala de nuevo.' && claveMala.nombrePendiente === 'cartola_visa_enc.pdf' && claveMala.movimientos === 0, claveMala);

  // Ahora con la clave correcta.
  await page.fill('[data-cartola-password-input]', '1196');
  await page.click('[data-reconciliar-archivo-abrir]');
  await page.waitForTimeout(1200);
  const claveBuena = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return { tipo: R.tipo, n: R.movimientos.length, archivo: R.archivo, nombrePendiente: R.archivoNombrePendiente, error: R.error, errorPassword: R.errorPassword };
  });
  check('Con la clave correcta, se lee el PDF y quedan los movimientos (mismo resultado que la copia sin clave, 47)', claveBuena.tipo === 'tarjeta_nacional' && claveBuena.n === 47, claveBuena);
  check('Guarda el nombre del archivo ya leído', claveBuena.archivo === 'cartola_visa_enc.pdf', claveBuena);
  check('Ya no queda nada pendiente de clave', claveBuena.nombrePendiente === null && !claveBuena.error && !claveBuena.errorPassword, claveBuena);

  // "Cancelar" en el campo de clave: no debe dejar nada abierto ni tirar error.
  await page.click('[data-reconciliar-reset]');
  await page.waitForTimeout(150);
  const fileInput2 = await page.$('[data-reconciliar-file-input]');
  await fileInput2.setInputFiles(path.join(__dirname, 'fixtures', 'cartola_visa_enc.pdf'));
  await page.waitForTimeout(1500);
  await page.click('[data-reconciliar-archivo-cancelar]');
  await page.waitForTimeout(150);
  const cancelado = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return { nombrePendiente: R.archivoNombrePendiente, hayInputClave: !!document.querySelector('[data-cartola-password-input]'), hayCardArchivo: !!document.querySelector('[data-reconciliar-file-input]') };
  });
  check('"Cancelar" cierra el campo de clave y vuelve a la pantalla de elegir archivo', !cancelado.nombrePendiente && !cancelado.hayInputClave && cancelado.hayCardArchivo, cancelado);

  await finish({ context, browser, errors });
})();
