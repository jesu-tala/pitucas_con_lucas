const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const d = window.__debug;
    const out = {};

    // 1) The new default categories exist with the requested name/type/icon/color.
    out.supermercado = d.CATEGORIES.supermercado;
    out.restoranes = d.CATEGORIES.restoranes;
    out.hogar = d.CATEGORIES.hogar;
    out.sueldo = d.CATEGORIES.sueldo;
    out.pololosExtra = d.CATEGORIES.pololos_extra;
    out.gastosHormiga = d.CATEGORIES.gastos_hormiga;

    // 2) The old categories that are no longer in the new list are gone.
    out.oldKeysGone = ['delivery','entretencion','freelance','otros_gastos','otros_ingresos'].every(k => !d.CATEGORIES[k]);

    // 3) The investment platforms (Fintual/Racional/Banco de Chile/Buda) are still intact —
    // they're not free-form "categories", they're tied to Inversiones and shouldn't have been touched.
    out.platformsIntact = ['fintual','racional','banco_chile','buda'].every(k => !!d.CATEGORIES[k] && d.CATEGORIES[k].tipo==='inversion');

    // 4) Old transactions ended up remapped to the closest new category.
    const t5 = d.TRANSACTIONS.find(t=>t.id==='t5'); // Restobar Lastarria, previously 'delivery'
    const t10 = d.TRANSACTIONS.find(t=>t.id==='t10'); // Cine Hoyts, previously 'entretencion'
    const t11 = d.TRANSACTIONS.find(t=>t.id==='t11'); // Freelance diseño web, previously 'freelance'
    out.t5cat = t5.categorias[0].cat;
    out.t10cat = t10.categorias[0].cat;
    out.t11cat = t11.categorias[0].cat;

    // 5) The 3 transactions that were in "Otros ingresos" (no equivalent category in the
    // new list) ended up with no category (Sin categoría / Sin clasificar), not lost.
    const t71 = d.TRANSACTIONS.find(t=>t.id==='t71');
    const t72 = d.TRANSACTIONS.find(t=>t.id==='t72');
    const t59 = d.TRANSACTIONS.find(t=>t.id==='t59');
    out.otrosIngresosLimpios = [t71,t72,t59].every(t => t.categorias.length===0 && t.estado==='confirmado');

    // 6) catIconMarkup: a known icon from the SVG set renders as <svg>, a bare emoji
    // gets wrapped in <span class="emoji-icon">.
    out.markupSvg = d.catIconMarkup('trending').startsWith('<svg');
    out.markupEmoji = d.catIconMarkup('🛒');

    // 7) writeOffReceivable no longer falls back to the nonexistent 'otros_gastos' category: if the
    // original transaction had no category, the new "never paid" transaction doesn't either.
    d.TRANSACTIONS.push({id:'tsincat', fecha:'2026-08-20', hora:'10:00', comercio:'Compra sin clasificar',
      monto:20000, medio:'efectivo', tipo:'gasto', recurrencia:'variable', estado:'pendiente',
      categorias:[], porCobrar:[{persona:'Pancho', monto:10000, pagado:false, tipo:'persona', montoRecibido:null, linkedTxId:null}],
      reglaAuto:false, nota:''});
    const antes = d.TRANSACTIONS.length;
    d.writeOffReceivable('tsincat', 0);
    out.perdidaCreoTx = d.TRANSACTIONS.length === antes + 1;
    const nuevaPerdida = d.TRANSACTIONS[d.TRANSACTIONS.length - 1];
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
  check('7) writeOffReceivable ya no inventa una categoría "otros_gastos" inexistente', resultado.perdidaCreoTx && resultado.perdidaSinCategoriaFalsa, resultado);

  // 8) UI: the new category editor uses the emoji grid (not the old SVG icon set).
  await page.evaluate(() => {
    window.__debug.state.tab = 'menu';
    window.__debug.state.menuSection = 'categorias';
    window.__debug.state.editingCategoryId = 'nueva';
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

  // 9) Picking an emoji from the grid and saving creates the category with that emoji as its icon.
  await page.click('[data-cat-draft-field="nombre"]');
  await page.fill('[data-cat-draft-field="nombre"]', 'Mascotas');
  await page.click('[data-cat-draft-icon="🐾"]');
  await page.click('[data-save-cat="nueva"]');
  await page.waitForTimeout(150);
  const nuevaCatOk = await page.evaluate(() => {
    const id = Object.keys(window.__debug.CATEGORIES).find(k => window.__debug.CATEGORIES[k].nombre === 'Mascotas');
    return id ? window.__debug.CATEGORIES[id].icon : null;
  });
  check('9) Categoría nueva creada desde el grid de emojis queda con el emoji elegido', nuevaCatOk === '🐾', nuevaCatOk);

  // 10) The free-text field also allows an emoji that's not in the grid.
  await page.evaluate(() => {
    window.__debug.state.editingCategoryId = 'nueva';
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
    const id = Object.keys(window.__debug.CATEGORIES).find(k => window.__debug.CATEGORIES[k].nombre === 'Lentes');
    return id ? window.__debug.CATEGORIES[id].icon : null;
  });
  check('10) Categoría nueva creada escribiendo un emoji libre (no del grid) también queda bien', nuevaCatLibre === '🤓', nuevaCatLibre);

  await finish({ context, browser, errors });
})();
