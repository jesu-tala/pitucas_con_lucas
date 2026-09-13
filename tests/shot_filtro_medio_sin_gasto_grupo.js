// Bug 4: el filtro de tarjeta/medio mostraba "Gasto de grupo" como una opción, cuando no es un
// medio de pago real -- es un valor sintético (SHARED_EXPENSE_PAYMENT_METHOD_ID, ver
// ensureSharedExpensePaymentMethod en views/menu.ts) que se le pone al campo `medio` de "mi
// parte" de un gasto de grupo que registró otra persona, solo para que ese campo tenga algo (esa
// plata nunca salió de ninguna tarjeta/cuenta tuya). El filtro de grupo (aparte) sigue
// apareciendo normal cuando hay grupos creados -- el problema es solo que se colaba DENTRO de
// medio.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    // Simula lo que hace syncSharedExpenses de verdad: registra el medio sintético en
    // PAYMENT_METHODS (así el detalle de esa transacción lo puede mostrar) y crea una
    // transacción "mi parte de un gasto de grupo" apuntando a él.
    const medioId = D.ensureSharedExpensePaymentMethod();
    D.TRANSACTIONS.push({
      id: 'txGrupoAjeno', fecha: D.todayISO(), hora: '10:00', comercio: 'Cena (grupo)', monto: 15000,
      medio: medioId, tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'restoranes', monto: 15000 }], porCobrar: [], reglaAuto: false, nota: '',
      sharedByOthers: true
    });
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-open-filters]');
  await page.waitForTimeout(150);

  const medioSection = await page.evaluate(() => {
    const titulo = Array.from(document.querySelectorAll('.sheet-block-title')).find(el => el.textContent.trim() === 'Tarjeta / medio');
    const wrap = titulo ? titulo.parentElement : null;
    const chips = wrap ? Array.from(wrap.querySelectorAll('[data-toggle-filter-medio]')).map(b => b.textContent.trim()) : [];
    return { existe: !!titulo, chips };
  });
  check('La sección "Tarjeta / medio" existe (con los medios reales)', medioSection.existe, medioSection);
  check('"Gasto de grupo" NO aparece como opción dentro de Tarjeta/medio', !medioSection.chips.some(c => c.includes('Gasto de grupo')), medioSection.chips);
  check('   pero los medios reales (ej. Efectivo) sí siguen apareciendo', medioSection.chips.some(c => c.includes('Efectivo')), medioSection.chips);

  await finish({ context, browser, errors });
})();
