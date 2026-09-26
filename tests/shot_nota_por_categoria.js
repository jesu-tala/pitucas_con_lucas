// Notas por categoría en Balance: para acordarte de por qué gastaste lo que gastaste ese mes.
//
// La nota es por categoría Y POR MES -- la de "Restoranes" de septiembre es otra que la de
// octubre. Por eso NOTAS_CATEGORIA tiene el mes AFUERA y la categoría adentro: al dibujar Balance
// ya se sabe qué mes se está mirando, así que NOTAS_CATEGORIA[mes] entrega de una todas las notas
// visibles y el indicador de cada fila se resuelve sin recorrer nada.
//
// Lo que este test cuida, además de guardar y leer: que las notas de meses distintos NO se
// mezclen (el error fácil de este modelo), que viajen en el blob que se persiste, y que el modo
// demo no exponga las reales -- eso último importa porque este mismo mecanismo de intercambio de
// estado fue el que una vez dejó una cuenta real sin categorías.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    const sep = '2026-09', oct = '2026-10';

    D.setNotaCategoria(sep, 'restoranes', 'Cumpleaños de mi mamá, pagué yo la mesa');
    D.setNotaCategoria(oct, 'restoranes', 'Mes tranquilo');
    D.setNotaCategoria(sep, 'transporte', 'Se me echó a perder el auto');

    const enBlob = D.buildFullStateBlob().notasCategoria;
    return {
      septiembre: D.notaCategoria(sep, 'restoranes'),
      octubre: D.notaCategoria(oct, 'restoranes'),
      otraCategoria: D.notaCategoria(sep, 'transporte'),
      sinNota: D.notaCategoria(sep, 'supermercado'),
      // La forma guardada: mes afuera, categoría adentro.
      formaDelBlob: enBlob,
      mesesGuardados: Object.keys(enBlob).sort()
    };
  });

  check('(control) se guardó la nota de septiembre', r.septiembre === 'Cumpleaños de mi mamá, pagué yo la mesa', r);
  check('la nota de otro MES es distinta (no se mezclan entre meses)', r.octubre === 'Mes tranquilo', r);
  check('   y la de otra categoría del mismo mes también es la suya', r.otraCategoria === 'Se me echó a perder el auto', r);
  check('   una categoría sin nota devuelve vacío, no la de otra', r.sinNota === '', r);
  check('la nota viaja en el blob que se persiste (Supabase / respaldo JSON)',
    r.formaDelBlob && r.formaDelBlob['2026-09'] && r.formaDelBlob['2026-09'].restoranes === 'Cumpleaños de mi mamá, pagué yo la mesa', r.formaDelBlob);
  check('   guardada con el mes afuera y la categoría adentro', r.mesesGuardados.join(',') === '2026-09,2026-10', r.mesesGuardados);

  // Guardar vacío BORRA, en vez de dejar una entrada en blanco que encendería el indicador.
  const trasBorrar = await page.evaluate(() => {
    const D = window.__debug;
    D.setNotaCategoria('2026-10', 'restoranes', '   ');
    const blob = D.buildFullStateBlob().notasCategoria;
    return { octubre: D.notaCategoria('2026-10', 'restoranes'), meses: Object.keys(blob).sort() };
  });
  check('guardar una nota vacía la borra (el indicador no queda encendido sobre nada)',
    trasBorrar.octubre === '' && trasBorrar.meses.join(',') === '2026-09', trasBorrar);

  // ---- El indicador en la fila del desglose ----
  const indicador = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[0], f = d => mes + '-' + String(d).padStart(2, '0');
    D.TRANSACTIONS.length = 0;
    [['restoranes', 40000, 3], ['supermercado', 25000, 4]].forEach(([cat, monto, d], i) => {
      D.TRANSACTIONS.push({ id: 'n' + i, fecha: f(d), hora: '10:00', comercio: 'C' + i, monto,
        medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
        categorias: [{ cat, monto }], porCobrar: [], reglaAuto: false, nota: '' });
    });
    D.setNotaCategoria(mes, 'restoranes', 'Acá sí hay nota');
    D.render();
    return { mes };
  });

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(200);
  for (let i = 0; i < 12; i++) {
    const dis = await page.$eval('[data-month-nav="-1"]', el => el.disabled).catch(() => true);
    if (dis) break;
    await page.click('[data-month-nav="-1"]'); await page.waitForTimeout(60);
  }
  await page.waitForTimeout(250);

  const filas = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.legend-row-wrap').forEach(w => {
      const cat = (w.querySelector('.legend-row') || {}).getAttribute ? w.querySelector('.legend-row').getAttribute('data-cat') : null;
      const btn = w.querySelector('[data-nota-cat]');
      if (cat) out[cat] = { hayBoton: !!btn, encendido: !!(btn && btn.classList.contains('tiene-nota')) };
    });
    return out;
  });
  check('(control) el desglose dibuja las dos categorías con su botón de nota',
    filas.restoranes && filas.supermercado && filas.restoranes.hayBoton && filas.supermercado.hayBoton, filas);
  check('la categoría CON nota muestra el indicador encendido', filas.restoranes.encendido === true, filas);
  check('   y la que no tiene nota, apagado', filas.supermercado.encendido === false, filas);

  // ---- Abrir el pop-up y editar desde ahí ----
  await page.click('[data-nota-cat="restoranes"]');
  await page.waitForTimeout(300);
  const popup = await page.evaluate(() => ({
    abierto: !!document.querySelector('[data-nota-texto]'),
    texto: (document.querySelector('[data-nota-texto]') || {}).value,
    // Reutiliza el patrón de sheets de la app, no un pop-up propio.
    usaSheet: !!document.querySelector('#sheet-content .sheet-block.card')
  }));
  check('el ícono abre el pop-up con la nota que ya estaba escrita',
    popup.abierto === true && popup.texto === 'Acá sí hay nota', popup);
  check('   y usa el patrón de sheets de la app (.sheet-block.card), no uno inventado', popup.usaSheet === true, popup);

  await page.fill('[data-nota-texto]', 'Nota editada desde el pop-up');
  await page.click('[data-nota-guardar]');
  await page.waitForTimeout(300);
  const trasEditar = await page.evaluate(() => window.__debug.notaCategoria(window.__debug.MONTHS[0], 'restoranes'));
  check('editar y guardar desde el pop-up persiste el texto nuevo', trasEditar === 'Nota editada desde el pop-up', trasEditar);

  // ---- Modo demo no puede exponer las notas reales ----
  const demo = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[0];
    const real = D.notaCategoria(mes, 'restoranes');
    D.enterDemoMode();
    const enDemo = D.buildFullStateBlob().notasCategoria || {};
    const visibleEnDemo = D.notaCategoria(mes, 'restoranes');
    D.exitDemoMode();
    return { real, visibleEnDemo, notasEnDemo: Object.keys(enDemo).length, trasSalir: D.notaCategoria(mes, 'restoranes') };
  });
  check('el modo demo NO expone las notas reales', demo.visibleEnDemo === '' && demo.notasEnDemo === 0, demo);
  check('   y al salir del modo demo vuelven intactas (no se pierden)', demo.trasSalir === demo.real && demo.real.length > 0, demo);

  await finish({ context, browser, errors });
})();
