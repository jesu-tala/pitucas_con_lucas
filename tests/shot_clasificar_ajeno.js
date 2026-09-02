// UI: clasificar "mi parte" de un gasto de grupo que registró otra persona (compartidoAjeno),
// y que esa clasificación aprenda el mapeo de categorías para la próxima vez. La parte pura
// (motor de balances, que el mapeo "pega" solo en sincronizarGastosCompartidos) ya está cubierta
// por audit_gastos_compartidos.js -- este test cubre el camino real de UI: abrir la transacción
// derivada desde la lista, ver la sugerencia de categoría de origen, tocar un chip, y confirmar
// que tanto la transacción como el mapeo aprendido quedan bien, todo a través de los mismos
// clics/handlers que usaría la usuaria (data-pick-cat), no llamando la función interna directo.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // Fixture: grupo "Casa" (Yo + Fran), un gasto que pagó y registró Fran ("Comida", $20.000),
  // de la cual me tocan $10.000 -- sin mapeo previo, así que debería llegarme "pendiente" con la
  // sugerencia de categoría de origen "Comida".
  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GRUPOS = [{ id: 'g1', nombre: 'Casa', icono: '🏠', creado_por: 'user-fran', invite_code: 'x', created_at: '' }];
    D.GRUPO_PARTICIPANTES = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    D.GASTOS_COMPARTIDOS = [
      { id: 'gcA', grupo_id: 'g1', descripcion: 'Supermercado Lider', categoria_origen: 'Comida', monto: 20000,
        fecha: '2026-08-15', pagado_por: 'p2', registrado_por: 'user-fran', division_tipo: 'iguales',
        tx_origen_id: 'tx-fran-x',
        reparto: [{ id: 'rA1', gasto_compartido_id: 'gcA', participante_id: 'p1', monto: 10000 },
                  { id: 'rA2', gasto_compartido_id: 'gcA', participante_id: 'p2', monto: 10000 }] }
    ];
    D.MAPEO_CATEGORIAS = [];
    D.sincronizarGastosCompartidos();
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  // (a) La entrada derivada aparece en la lista normal de transacciones (mismo trato que
  // cualquier movimiento "pendiente" de clasificar), con el ítem clicable.
  const enLista = await page.evaluate(() => !!document.querySelector('[data-tx="compartido-gcA"]'));
  check('(a) "Mi parte" del gasto de Fran aparece en la lista de transacciones', enLista === true);

  // (b) Al abrir el detalle: se ve la grilla de categorías (needsClassifying) con la sugerencia
  // de la categoría de origen que anotó Fran ("Comida"), y NO la sección normal de "Compartir
  // con un grupo" (esta transacción es la parte ajena, no algo que yo pueda volver a compartir).
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

  // (c) Tocar la categoría "Supermercado" clasifica esta transacción Y aprende el mapeo
  // (de Fran, "Comida" -> supermercado) para la próxima vez.
  await page.click('[data-pick-cat="supermercado"]');
  await page.waitForTimeout(200);
  const clasificado = await page.evaluate(() => {
    const D = window.__debug;
    const tx = D.TX.find(t => t.id === 'compartido-gcA');
    return {
      estado: tx.estado,
      categoria: tx.categorias[0] && tx.categorias[0].cat,
      mapeo: D.MAPEO_CATEGORIAS.slice(),
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

  // (d) Un gasto NUEVO de Fran, misma categoría de origen ("Comida"), se clasifica solo la
  // próxima vez que se resincroniza -- sin que la usuaria tenga que volver a clasificar nada.
  await page.evaluate(() => {
    const D = window.__debug;
    D.GASTOS_COMPARTIDOS.push({
      id: 'gcB', grupo_id: 'g1', descripcion: 'Jumbo', categoria_origen: 'Comida', monto: 16000,
      fecha: '2026-08-22', pagado_por: 'p2', registrado_por: 'user-fran', division_tipo: 'iguales',
      tx_origen_id: 'tx-fran-y',
      reparto: [{ id: 'rB1', gasto_compartido_id: 'gcB', participante_id: 'p1', monto: 8000 },
                { id: 'rB2', gasto_compartido_id: 'gcB', participante_id: 'p2', monto: 8000 }]
    });
    D.sincronizarGastosCompartidos();
    D.render();
  });
  await page.waitForTimeout(150);
  const autoclasificado = await page.evaluate(() => {
    const D = window.__debug;
    const tx = D.TX.find(t => t.id === 'compartido-gcB');
    return { existe: !!tx, estado: tx && tx.estado, categoria: tx && tx.categorias[0] && tx.categorias[0].cat };
  });
  check('(d) Un gasto nuevo de Fran con la misma categoría de origen se clasifica solo (sin volver a tocar nada)',
    autoclasificado.existe && autoclasificado.estado === 'confirmado' && autoclasificado.categoria === 'supermercado',
    autoclasificado);

  await finish({ context, browser, errors });
})();
