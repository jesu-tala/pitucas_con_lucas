// Menú > "Reconciliar con la cartola": entrar siempre arranca en la pantalla principal.
//
// El bug: renderMenuReconciliar decide qué mostrar según `state.reconciliar.movimientos.length`,
// y ese estado no se limpiaba nunca al entrar. Entonces, después de abrir una cartola, irse a
// otra pestaña y volver a apretar Reconciliar, la app reabría el diff de la cartola anterior en
// vez de la pantalla para elegir una -- y desde ahí no había forma obvia de volver atrás.
//
// El arreglo limpia el estado de la cartola abierta al entrar a la sección, dejando intacta
// `disponibles` (la lista de las que llegaron por correo), que se recarga sola.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Simula "ya abrí una cartola": es exactamente el estado que dejaba useImportedStatement().
  const dejarCartolaAbierta = async () => {
    await page.evaluate(() => {
      const R = window.__debug.state.reconciliar;
      R.archivo = 'Cartola septiembre.pdf';
      R.tipo = 'cuenta_corriente';
      R.movimientos = [
        { fecha: '2026-09-03', detalle: 'JUMBO COSTANERA', monto: 45990, tipoMov: 'cargo', esEspecial: false, yaRegistrada: false, idSugerido: null },
        { fecha: '2026-09-07', detalle: 'METRO SA', monto: 1500, tipoMov: 'cargo', esEspecial: false, yaRegistrada: false, idSugerido: null },
      ];
      R.eliminarSeleccionados = ['x'];
      R.passwordDraft = '1234';
    });
  };

  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="reconciliar"]');
  await page.waitForTimeout(250);
  let txt = await page.textContent('#view-root');
  check('(control) sin cartola abierta entra a la pantalla principal', !/JUMBO COSTANERA/.test(txt), txt.slice(0, 200));

  // Deja una cartola "abierta" y comprueba que el render la muestra -- si esto no se viera, el
  // test de abajo pasaría por no haber nada que limpiar, no por el arreglo.
  await dejarCartolaAbierta();
  await page.evaluate(() => window.__debug.renderMenuView());
  await page.waitForTimeout(200);
  txt = await page.textContent('#view-root');
  check('(control) con una cartola abierta, el diff sí se muestra', /JUMBO COSTANERA/.test(txt), txt.slice(0, 300));

  // Camino 1 del bug: irse a otra pestaña y volver al Menú. Cambiar de pestaña NO limpia
  // state.menuSection (a propósito: volver al Menú te deja donde estabas), así que este camino
  // vuelve directo a la pantalla de Reconciliar sin pasar por la lista del menú -- y era el que
  // quedaba vivo si la limpieza se hacía solo al abrir la sección.
  await page.click('[data-tab="transacciones"]');
  await page.waitForTimeout(200);
  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(300);
  txt = await page.textContent('#view-root');
  check('volver desde otra pestaña NO reabre la cartola anterior', !/JUMBO COSTANERA/.test(txt), txt.slice(0, 400));

  // Camino 2: volver a la lista del menú y apretar Reconciliar de nuevo.
  await dejarCartolaAbierta();
  await page.evaluate(() => window.__debug.renderMenuView());
  await page.waitForTimeout(150);
  await page.click('[data-menu-back]');
  await page.waitForTimeout(250);
  await page.click('[data-menu-open="reconciliar"]');
  await page.waitForTimeout(300);

  txt = await page.textContent('#view-root');
  check('volver a entrar NO reabre la cartola anterior', !/JUMBO COSTANERA/.test(txt), txt.slice(0, 400));
  check('volver a entrar deja la pantalla principal de reconciliar', /[Rr]econciliar/.test(txt), txt.slice(0, 300));

  const limpio = await page.evaluate(() => {
    const R = window.__debug.state.reconciliar;
    return {
      movimientos: R.movimientos.length,
      archivo: R.archivo,
      seleccionados: R.eliminarSeleccionados.length,
      password: R.passwordDraft,
      tipo: R.tipo,
    };
  });
  check('se limpian los movimientos de la cartola anterior', limpio.movimientos === 0, limpio);
  check('se limpia el nombre del archivo anterior', limpio.archivo === null, limpio);
  check('se limpia el tipo de cartola anterior', limpio.tipo === null, limpio);
  // Arrastrar estos dos entre cartolas es peor que un resto visual: la selección de "eliminar"
  // apuntaría a ids de OTRA cartola, y la clave tecleada quedaría precargada para la siguiente.
  check('se limpia la selección de "eliminar" de la cartola anterior', limpio.seleccionados === 0, limpio);
  check('se limpia la clave tecleada para la cartola anterior', limpio.password === '', limpio);

  await browser.close();
  finish(errors);
})();
