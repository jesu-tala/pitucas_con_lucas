// UI: classifying "my share" of a group expense that another person registered (sharedByOthers),
// and having that classification learn the category mapping for next time. The pure part
// (balance engine, the mapping "sticking" on its own in syncSharedExpenses) is already covered
// by audit_gastos_compartidos.js -- this test covers the real UI path: opening the derived
// transaction from the list, seeing the origin-category suggestion, tapping a chip, and confirming
// that both the transaction and the learned mapping end up correct, all through the same
// clicks/handlers the user would use (data-pick-cat), without calling the internal function directly.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Fixture: "Casa" group (Yo + Fran), an expense Fran paid and registered ("Comida", $20,000),
  // of which I owe $10,000 -- no prior mapping, so it should reach me "pendiente" with the
  // origin-category suggestion "Comida".
  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Casa', icono: '🏠', creado_por: 'user-fran', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    D.SHARED_EXPENSES = [
      { id: 'gcA', grupo_id: 'g1', descripcion: 'Supermercado Lider', categoria_origen: 'Comida', monto: 20000,
        fecha: '2026-08-15', pagado_por: 'p2', registrado_por: 'user-fran', division_tipo: 'iguales',
        tx_origen_id: 'tx-fran-x',
        reparto: [{ id: 'rA1', gasto_compartido_id: 'gcA', participante_id: 'p1', monto: 10000 },
                  { id: 'rA2', gasto_compartido_id: 'gcA', participante_id: 'p2', monto: 10000 }] }
    ];
    D.CATEGORY_MAPPINGS = [];
    D.syncSharedExpenses();
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  // (a) The derived entry appears in the normal transaction list (same treatment as
  // any "pendiente" movement waiting to be classified), with the item clickable.
  const enLista = await page.evaluate(() => !!document.querySelector('[data-tx="compartido-gcA"]'));
  check('(a) "Mi parte" del gasto de Fran aparece en la lista de transacciones', enLista === true);

  // (b) Opening the detail: you see the category grid (needsClassifying) with the suggestion
  // of the origin category Fran noted ("Comida"), and NOT the normal "Compartir
  // con un grupo" section (this transaction is someone else's share, not something I can re-share).
  await page.click('[data-tx="compartido-gcA"]');
  await page.waitForTimeout(200);
  const detalle = await page.evaluate(() => {
    const content = document.getElementById('sheet-content');
    return {
      mencionaSugerencia: content.textContent.includes('Comida'),
      mencionaGrupo: content.textContent.includes('gasto de grupo') || content.textContent.includes('grupo'),
      tieneGrilla: !!document.querySelector('[data-pick-cat]'),
      tieneSeccionCompartir: content.textContent.includes('Compartir con un grupo'),
    };
  });
  check('(b) El detalle muestra la sugerencia de categoría de origen ("Comida")', detalle.mencionaSugerencia === true, detalle);
  check('   muestra la grilla de categorías para clasificar (como cualquier pendiente)', detalle.tieneGrilla === true, detalle);
  check('   NO ofrece "Compartir con un grupo" (esta es la parte ajena, no se vuelve a compartir)', detalle.tieneSeccionCompartir === false, detalle);

  // (c) Tapping the "Supermercado" category classifies this transaction AND learns the mapping
  // (from Fran, "Comida" -> supermercado) for next time.
  await page.click('[data-pick-cat="supermercado"]');
  await page.waitForTimeout(200);
  const clasificado = await page.evaluate(() => {
    const D = window.__debug;
    const tx = D.TRANSACTIONS.find(t => t.id === 'compartido-gcA');
    return {
      estado: tx.estado,
      categoria: tx.categorias[0] && tx.categorias[0].cat,
      mapeo: D.CATEGORY_MAPPINGS.slice(),
      contenidoSheet: document.getElementById('sheet-content').textContent,
    };
  });
  check('(c) La transacción queda confirmada con la categoría elegida (supermercado)',
    clasificado.estado === 'confirmado' && clasificado.categoria === 'supermercado', clasificado);
  check('   se aprendió el mapeo (de Fran, "Comida" -> supermercado)',
    clasificado.mapeo.length === 1 && clasificado.mapeo[0].de_participante === 'p2' &&
    clasificado.mapeo[0].categoria_ajena === 'Comida' && clasificado.mapeo[0].categoria_propia === 'supermercado',
    clasificado.mapeo);
  check('   el detalle ya no muestra la grilla de clasificar (ahora se ve como categoría normal editable)',
    !clasificado.contenidoSheet.includes('Elige tu categoría'));
  await page.click('[data-close-sheet-done]');
  await page.waitForTimeout(150);

  // (d) A NEW expense from Fran, same origin category ("Comida"), classifies itself the
  // next time it's resynced -- without the user having to classify anything again.
  await page.evaluate(() => {
    const D = window.__debug;
    D.SHARED_EXPENSES.push({
      id: 'gcB', grupo_id: 'g1', descripcion: 'Jumbo', categoria_origen: 'Comida', monto: 16000,
      fecha: '2026-08-22', pagado_por: 'p2', registrado_por: 'user-fran', division_tipo: 'iguales',
      tx_origen_id: 'tx-fran-y',
      reparto: [{ id: 'rB1', gasto_compartido_id: 'gcB', participante_id: 'p1', monto: 8000 },
                { id: 'rB2', gasto_compartido_id: 'gcB', participante_id: 'p2', monto: 8000 }]
    });
    D.syncSharedExpenses();
    D.render();
  });
  await page.waitForTimeout(150);
  const autoclasificado = await page.evaluate(() => {
    const D = window.__debug;
    const tx = D.TRANSACTIONS.find(t => t.id === 'compartido-gcB');
    return { existe: !!tx, estado: tx && tx.estado, categoria: tx && tx.categorias[0] && tx.categorias[0].cat };
  });
  check('(d) Un gasto nuevo de Fran con la misma categoría de origen se clasifica solo (sin volver a tocar nada)',
    autoclasificado.existe && autoclasificado.estado === 'confirmado' && autoclasificado.categoria === 'supermercado',
    autoclasificado);

  await finish({ context, browser, errors });
})();
