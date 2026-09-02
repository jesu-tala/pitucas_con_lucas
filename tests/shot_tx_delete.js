// Regresión: la usuaria reportó que ya no podía eliminar transacciones -- el botón de borrar
// solo existía para transacciones importadas por correo (t.importadoEmail). Ahora el detalle de
// CUALQUIER transacción existente muestra una barra de acciones al fondo: un botón rojo de
// borrar (chico, a la izquierda) y "Listo" (grande, a la derecha) -- ver .sheet-bottom-actions.
// Este test cubre: el botón existe para una transacción normal (no importada), pedir
// confirmación antes de borrar, poder cancelar, y que "Sí, eliminar" de verdad la saque de TX.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(150);

  // t3 = Uber, transacción normal de la maqueta (no importada por correo).
  await page.click('[data-tx="t3"]');
  await page.waitForTimeout(200);

  const antesDeBorrar = await page.evaluate(() => ({
    existeTx: !!window.__debug.TX.find(t => t.id === 't3'),
    hayBotonBorrar: !!document.querySelector('[data-ask-delete-tx="t3"]'),
    hayBotonListo: !!document.querySelector('[data-close-sheet-done]'),
    hayConfirmacion: !!document.querySelector('.sheet-delete-confirm'),
  }));
  check('(a) t3 existe antes de borrar', antesDeBorrar.existeTx === true);
  check('(b) el detalle de una transacción NORMAL (no importada) tiene botón de borrar', antesDeBorrar.hayBotonBorrar === true, antesDeBorrar);
  check('(c) y también el botón "Listo", ambos en la misma barra de acciones', antesDeBorrar.hayBotonListo === true, antesDeBorrar);
  check('(d) todavía no se pide confirmación (no se ha tocado borrar)', antesDeBorrar.hayConfirmacion === false, antesDeBorrar);

  // Tocar borrar debe pedir confirmación, no borrar directo.
  await page.click('[data-ask-delete-tx="t3"]');
  await page.waitForTimeout(150);
  const trasPedirBorrar = await page.evaluate(() => ({
    existeTx: !!window.__debug.TX.find(t => t.id === 't3'),
    hayConfirmacion: !!document.querySelector('.sheet-delete-confirm'),
    hayCancelar: !!document.querySelector('[data-cancel-delete-tx="t3"]'),
    hayConfirmar: !!document.querySelector('[data-confirm-delete-tx="t3"]'),
  }));
  check('(e) tocar borrar pide confirmación, no borra todavía', trasPedirBorrar.existeTx === true && trasPedirBorrar.hayConfirmacion === true, trasPedirBorrar);
  check('   con botones Cancelar y "Sí, eliminar"', trasPedirBorrar.hayCancelar === true && trasPedirBorrar.hayConfirmar === true, trasPedirBorrar);

  // Cancelar debe volver al estado normal sin borrar nada.
  await page.click('[data-cancel-delete-tx="t3"]');
  await page.waitForTimeout(150);
  const trasCancelar = await page.evaluate(() => ({
    existeTx: !!window.__debug.TX.find(t => t.id === 't3'),
    hayConfirmacion: !!document.querySelector('.sheet-delete-confirm'),
    hayBotonBorrar: !!document.querySelector('[data-ask-delete-tx="t3"]'),
  }));
  check('(f) Cancelar no borra la transacción', trasCancelar.existeTx === true, trasCancelar);
  check('   y vuelve a mostrar el botón de borrar normal (no la confirmación)', trasCancelar.hayConfirmacion === false && trasCancelar.hayBotonBorrar === true, trasCancelar);

  // Ahora sí: pedir borrar y confirmar de verdad.
  await page.click('[data-ask-delete-tx="t3"]');
  await page.waitForTimeout(150);
  await page.click('[data-confirm-delete-tx="t3"]');
  await page.waitForTimeout(200);
  // Ojo: "Sí, eliminar" hace TX = TX.filter(...), que REEMPLAZA el arreglo (nueva referencia) --
  // window.__debug.TX (una referencia capturada una sola vez al cargar la página) se queda
  // apuntando al arreglo viejo y seguiría "viendo" a t3. Por eso se verifica contra el DOM
  // visible, igual que ya hace shot_import_pendiente.js. Ojo también: closeSheet() solo oculta
  // el overlay (le saca la clase "open"), no vacía #sheet-content -- los campos del formulario
  // que quedan ahí (input de monto, de fecha, etc.) también llevan data-tx="t3" como atributo
  // propio, así que el selector genérico "[data-tx=t3]" los sigue encontrando aunque la fila de
  // la lista ya haya desaparecido. Hay que apuntar puntual a la fila (.tx-item[data-tx]).
  const trasConfirmar = await page.evaluate(() => ({
    filaSigueEnDom: !!document.querySelector('.tx-item[data-tx="t3"]'),
    sheetAbierto: document.getElementById('sheet-overlay').classList.contains('open'),
  }));
  check('(g) "Sí, eliminar" saca la transacción de la vista', trasConfirmar.filaSigueEnDom === false, trasConfirmar);
  check('   y cierra el detalle', trasConfirmar.sheetAbierto === false, trasConfirmar);

  await finish({ context, browser, errors });
})();
