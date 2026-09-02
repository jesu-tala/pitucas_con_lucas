const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const d = window.__debug;
    const out = {};

    // 1) Las categorías por defecto nuevas existen con el nombre/tipo/ícono/color pedidos.
    out.supermercado = d.CATS.supermercado;
    out.restoranes = d.CATS.restoranes;
    out.hogar = d.CATS.hogar;
    out.sueldo = d.CATS.sueldo;
    out.pololosExtra = d.CATS.pololos_extra;
    out.gastosHormiga = d.CATS.gastos_hormiga;

    // 2) Las categorías viejas que ya no están en la lista nueva desaparecieron.
    out.oldKeysGone = ['delivery','entretencion','freelance','otros_gastos','otros_ingresos'].every(k => !d.CATS[k]);

    // 3) Las plataformas de inversión (Fintual/Racional/Banco de Chile/Buda) siguen intactas —
    // no son "categorías" libres, están ligadas a Inversiones y no debían tocarse.
    out.platformsIntact = ['fintual','racional','banco_chile','buda'].every(k => !!d.CATS[k] && d.CATS[k].tipo==='inversion');

    // 4) Transacciones viejas quedaron remapeadas a la categoría nueva más parecida.
    const t5 = d.TX.find(t=>t.id==='t5'); // Restobar Lastarria, antes 'delivery'
    const t10 = d.TX.find(t=>t.id==='t10'); // Cine Hoyts, antes 'entretencion'
    const t11 = d.TX.find(t=>t.id==='t11'); // Freelance diseño web, antes 'freelance'
    out.t5cat = t5.categorias[0].cat;
    out.t10cat = t10.categorias[0].cat;
    out.t11cat = t11.categorias[0].cat;

    // 5) Las 3 transacciones que estaban en "Otros ingresos" (sin categoría equivalente en la
    // lista nueva) quedaron sin categoría (Sin categoría / Sin clasificar), no perdidas.
    const t71 = d.TX.find(t=>t.id==='t71');
    const t72 = d.TX.find(t=>t.id==='t72');
    const t59 = d.TX.find(t=>t.id==='t59');
    out.otrosIngresosLimpios = [t71,t72,t59].every(t => t.categorias.length===0 && t.estado==='confirmado');

    // 6) catIconMarkup: un ícono conocido del set SVG se renderiza como <svg>, un emoji suelto
    // se envuelve en <span class="emoji-icon">.
    out.markupSvg = d.catIconMarkup('trending').startsWith('<svg');
    out.markupEmoji = d.catIconMarkup('🛒');

    // 7) darPorPerdida ya no cae en la categoría inexistente 'otros_gastos': si la transacción
    // original no tenía categoría, la nueva transacción de "nunca pagó" tampoco.
    d.TX.push({id:'tsincat', fecha:'2026-08-20', hora:'10:00', comercio:'Compra sin clasificar',
      monto:20000, medio:'efectivo', tipo:'gasto', recurrencia:'variable', estado:'pendiente',
      categorias:[], porCobrar:[{persona:'Pancho', monto:10000, pagado:false, tipo:'persona', montoRecibido:null, linkedTxId:null}],
      reglaAuto:false, nota:''});
    const antes = d.TX.length;
    d.darPorPerdida('tsincat', 0);
    out.perdidaCreoTx = d.TX.length === antes + 1;
    const nuevaPerdida = d.TX[d.TX.length - 1];
    out.perdidaSinCategoriaFalsa = nuevaPerdida.categorias.length === 0;

    return out;
  });

  check('1) Supermercado con nombre/tipo/color/ícono correctos', JSON.stringify(resultado.supermercado)==='{"nombre":"Supermercado","tipo":"gasto","color":"mint","icon":"🛒"}', resultado.supermercado);
  check('   Restoranes y bares', resultado.restoranes.nombre==='Restoranes y bares' && resultado.restoranes.icon==='🍽️', resultado.restoranes);
  check('   Hogar', resultado.hogar.icon==='🏠' && resultado.hogar.color==='lavender', resultado.hogar);
  check('   Sueldo (ingreso)', resultado.sueldo.icon==='💼' && resultado.sueldo.tipo==='ingreso', resultado.sueldo);
  check('   Pololos extra (ingreso)', resultado.pololosExtra.icon==='✨' && resultado.pololosExtra.tipo==='ingreso', resultado.pololosExtra);
  check('   Gastos hormiga', resultado.gastosHormiga.icon==='🐜', resultado.gastosHormiga);
  check('2) Categorías viejas (delivery/entretencion/freelance/otros_gastos/otros_ingresos) ya no existen', resultado.oldKeysGone);
  check('3) Plataformas de inversión (Fintual/Racional/Banco de Chile/Buda) intactas', resultado.platformsIntact);
  check('4) Transacciones viejas remapeadas: Restobar->restoranes', resultado.t5cat==='restoranes', resultado.t5cat);
  check('   Cine->entretenimiento', resultado.t10cat==='entretenimiento', resultado.t10cat);
  check('   Freelance->pololos_extra', resultado.t11cat==='pololos_extra', resultado.t11cat);
  check('5) Transacciones ex-"Otros ingresos" quedaron sin categoría (no perdidas, no mal etiquetadas)', resultado.otrosIngresosLimpios);
  check('6) catIconMarkup: nombre SVG conocido -> <svg>', resultado.markupSvg);
  check('   emoji suelto -> span', resultado.markupEmoji==='<span class="emoji-icon">🛒</span>', resultado.markupEmoji);
  check('7) darPorPerdida ya no inventa una categoría "otros_gastos" inexistente', resultado.perdidaCreoTx && resultado.perdidaSinCategoriaFalsa, resultado);

  // 8) UI: el editor de categorías nuevas usa el grid de emojis (no el set de íconos SVG viejo).
  await page.evaluate(() => {
    window.__debug.state.tab = 'menu';
    window.__debug.state.menuSection = 'categorias';
    window.__debug.state.editingCatId = 'nueva';
    window.__debug.state.catDraft = {nombre:'', tipo:'gasto', color:'sage', icon:'🏷️'};
    window.__debug.render();
  });
  await page.waitForTimeout(150);
  const uiCheck = await page.evaluate(() => {
    const grid = document.querySelector('.emoji-icon-picker');
    const buttons = grid ? Array.from(grid.querySelectorAll('button')) : [];
    const customInput = document.querySelector('[data-cat-draft-field="icon"]');
    return {
      gridExists: !!grid,
      nButtons: buttons.length,
      firstButtonText: buttons[0] ? buttons[0].textContent : null,
      customInputExists: !!customInput,
      customInputValue: customInput ? customInput.value : null
    };
  });
  check('8) El editor muestra un grid de emojis (no SVGs)', uiCheck.gridExists && uiCheck.nButtons > 30 && uiCheck.firstButtonText === '🛒' && uiCheck.customInputExists, uiCheck);

  // 9) Elegir un emoji del grid y guardar crea la categoría con ese emoji como ícono.
  await page.click('[data-cat-draft-field="nombre"]');
  await page.fill('[data-cat-draft-field="nombre"]', 'Mascotas');
  await page.click('[data-cat-draft-icon="🐾"]');
  await page.click('[data-save-cat="nueva"]');
  await page.waitForTimeout(150);
  const nuevaCatOk = await page.evaluate(() => {
    const id = Object.keys(window.__debug.CATS).find(k => window.__debug.CATS[k].nombre === 'Mascotas');
    return id ? window.__debug.CATS[id].icon : null;
  });
  check('9) Categoría nueva creada desde el grid de emojis queda con el emoji elegido', nuevaCatOk === '🐾', nuevaCatOk);

  // 10) El campo de texto libre también permite un emoji que no está en el grid.
  await page.evaluate(() => {
    window.__debug.state.editingCatId = 'nueva';
    window.__debug.state.catDraft = {nombre:'', tipo:'gasto', color:'sage', icon:'🏷️'};
    window.__debug.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-cat-draft-field="nombre"]');
  await page.fill('[data-cat-draft-field="nombre"]', 'Lentes');
  await page.click('[data-cat-draft-field="icon"]');
  await page.fill('[data-cat-draft-field="icon"]', '🤓');
  await page.click('[data-save-cat="nueva"]');
  await page.waitForTimeout(150);
  const nuevaCatLibre = await page.evaluate(() => {
    const id = Object.keys(window.__debug.CATS).find(k => window.__debug.CATS[k].nombre === 'Lentes');
    return id ? window.__debug.CATS[id].icon : null;
  });
  check('10) Categoría nueva creada escribiendo un emoji libre (no del grid) también queda bien', nuevaCatLibre === '🤓', nuevaCatLibre);

  await finish({ context, browser, errors });
})();
