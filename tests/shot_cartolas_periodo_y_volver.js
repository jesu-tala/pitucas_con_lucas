// Menú > "Reconciliar con la cartola": la lista dice de qué PERÍODO es cada cartola, muestra
// también las ya revisadas, y volver atrás desde una cartola abierta lleva a esa lista.
//
// Dos problemas que se arreglan juntos porque son el mismo: la lista solo servía para "cuál
// abro ahora", y nada más.
//
// 1. Mostraba únicamente cuándo LLEGÓ por correo, que no es lo que uno necesita para elegir: la
//    cartola que llega en septiembre cubre agosto, y si llegan dos el mismo mes (la de la cuenta
//    y la de la tarjeta) la fecha de llegada no las distingue en nada. Peor todavía: el banco
//    nombra igual el archivo todos los meses, así que en una base real había 19 cartolas de
//    meses distintos que en la lista se veían idénticas. El período exacto está adentro del
//    PDF, que viene con clave, así que se guarda al abrirla y desde entonces se muestra.
// 2. Se filtraba por `procesado = false`, así que una cartola desaparecía apenas se abría: no
//    se podía volver a ella ni ver cuáles ya habías revisado. Y la flecha de volver, al no
//    existir un nivel de "cartola abierta", se saltaba la lista entera y te dejaba en el menú.
const { openApp, check, finish } = require('./lib/test_kit');

const CARTOLAS = [
  // Sin período guardado: todavía no se ha abierto. Llegó el 4 de septiembre -> cubre agosto.
  { id: 'c1', tipo: 'cuenta_corriente', nombre_archivo: 'cartola.pdf',
    recibido_en: '2026-09-04T23:40:00Z', periodo_desde: null, periodo_hasta: null, procesado: false },
  // Con período guardado y ya revisada: se muestra el real, no la estimación.
  { id: 'c2', tipo: 'tarjeta_nacional', nombre_archivo: 'edo_cuenta.pdf',
    recibido_en: '2026-08-27T10:20:00Z', periodo_desde: '2026-07-16', periodo_hasta: '2026-08-15', procesado: true },
  // Período dentro de un solo mes: se muestra como el mes a secas.
  { id: 'c3', tipo: 'cuenta_corriente', nombre_archivo: 'cartola_jul.pdf',
    recibido_en: '2026-08-03T09:00:00Z', periodo_desde: '2026-07-01', periodo_hasta: '2026-07-31', procesado: true },
];

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="reconciliar"]');
  await page.waitForTimeout(250);

  await page.evaluate((cs) => {
    window.__debug.state.reconciliar.disponibles = cs;
    window.__debug.renderMenuView();
  }, CARTOLAS);
  await page.waitForTimeout(200);

  let txt = await page.textContent('#view-root');
  check('(control) se listan las 3 cartolas', (txt.match(/cuenta corriente|Estado de cuenta/g) || []).length >= 3, txt.slice(0, 400));

  // ---------- el período ----------
  // No se inventa un período estimado: recibido_en es cuándo el script IMPORTÓ la cartola, no
  // cuándo llegó el correo -- la primera corrida se trae meses de correos viejos de una sentada
  // y todos quedan con la misma fecha. Estimar desde ahí daría una etiqueta segura y falsa.
  check('la que no se ha abierto dice que su período no se sabe', /período sin identificar/.test(txt), txt.slice(0, 500));
  check('NO se inventa un período a partir de la fecha de llegada', !/probablemente/.test(txt), txt.slice(0, 500));
  check('se explica cómo averiguarlo', /Ábrela una vez con tu clave/.test(txt), txt.slice(0, 600));
  check('un período a caballo entre dos meses se muestra completo', /16 julio – 15 agosto 2026/.test(txt), txt.slice(0, 500));
  check('un período dentro de un solo mes se muestra como el mes', /julio 2026/.test(txt), txt.slice(0, 500));
  // Control positivo: donde SÍ hay período guardado no debe aparecer el texto de "sin
  // identificar" -- si apareciera en las tres, el período real no se estaría usando.
  const sinIdentificar = (txt.match(/período sin identificar/g) || []).length;
  check('(control) solo la cartola sin abrir queda sin identificar', sinIdentificar === 1, { sinIdentificar });

  // ---------- las ya revisadas ----------
  check('las cartolas ya revisadas siguen en la lista', /Ya la revisaste/.test(txt), txt.slice(0, 500));
  check('las ya revisadas ofrecen volver a verlas', /Ver de nuevo/.test(txt), txt.slice(0, 500));
  check('las que faltan siguen diciendo "Usar esta"', /Usar esta/.test(txt), txt.slice(0, 500));

  // ---------- volver atrás desde una cartola abierta ----------
  const profundidadAntes = await page.evaluate(() => window.__debug.navDepth ? window.__debug.navDepth() : null);

  await page.evaluate(() => {
    const D = window.__debug;
    const R = D.state.reconciliar;
    R.archivo = 'cartola.pdf';
    R.tipo = 'cuenta_corriente';
    R.movimientos = [{ fecha: '2026-08-03', detalle: 'JUMBO COSTANERA', monto: 45990, tipoMov: 'cargo', esEspecial: false, yaRegistrada: false, idSugerido: null }];
    D.navPush({ type: 'cartola-abierta' });
    D.renderMenuView();
  });
  await page.waitForTimeout(200);
  txt = await page.textContent('#view-root');
  check('(control) con la cartola abierta se ve su contenido', /JUMBO COSTANERA/.test(txt), txt.slice(0, 300));

  await page.click('[data-menu-back]');
  await page.waitForTimeout(250);
  txt = await page.textContent('#view-root');

  check('volver desde la cartola NO sale de Reconciliar', /[Cc]artolas que llegaron por correo/.test(txt), txt.slice(0, 400));
  check('volver desde la cartola deja de mostrar su contenido', !/JUMBO COSTANERA/.test(txt), txt.slice(0, 400));
  check('la lista de cartolas sigue ahí al volver', /Ver de nuevo|Usar esta/.test(txt), txt.slice(0, 400));

  const seccion = await page.evaluate(() => window.__debug.state.menuSection);
  check('se sigue dentro de la sección Reconciliar', seccion === 'reconciliar', { seccion });

  // Y un segundo "volver" sí sale al menú: el nivel de la cartola se consumió, no quedó colgado.
  await page.click('[data-menu-back]');
  await page.waitForTimeout(250);
  const seccionFinal = await page.evaluate(() => window.__debug.state.menuSection);
  check('un segundo "volver" sí sale al menú', seccionFinal === null, { seccionFinal, profundidadAntes });

  await browser.close();
  finish(errors);
})();
