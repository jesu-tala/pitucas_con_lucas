// Refinamientos D y E de grupos.
// D — Lenguaje y perspectiva: la pestaña Balances decía "Le deben"/"Debe" SIEMPRE, en tercera
// persona, incluso en la propia fila de quien mira ("test (tú) -- debe" en vez de "debes"). Ahora
// la fila propia usa segunda persona ("Te deben"/"Debes"); las de los demás siguen en tercera
// persona por nombre real (nunca "yo").
// E — Transparencia total: al ver/agregar un gasto del grupo (incluso uno que pagó otra persona),
// se muestra el total, cuánto debe cada participante involucrado -- nunca solo "tu parte". Esto ya
// estaba implementado (renderGroupExpenseDetailCard/renderGroupGastosTab) -- este test lo deja
// bloqueado con una regresión explícita.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Depto', icono: '🏠', creado_por: 'user-jesu', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'test', color: 'lavender' },
      { id: 'p2', grupo_id: 'g1', user_id: 'user-fran', nombre: 'Fran', color: 'mint' }
    ];
    // "test" (yo) le debe a Fran -- balance negativo para mí, positivo para Fran.
    D.SHARED_EXPENSES = [{
      id: 'se1', grupo_id: 'g1', descripcion: 'Supermercado', categoria_origen: null, monto: 20000,
      fecha: D.todayISO(), pagado_por: 'p2', registrado_por: 'user-fran', division_tipo: 'iguales', tx_origen_id: null,
      reparto: [
        { id: 'sp1', gasto_compartido_id: 'se1', participante_id: 'p1', monto: 10000 },
        { id: 'sp2', gasto_compartido_id: 'se1', participante_id: 'p2', monto: 10000 }
      ]
    }];
    D.state.tab = 'grupos';
    D.state.openGroupId = 'g1';
    D.state.groupDetailTab = 'balances';
    D.render();
  });
  await page.waitForTimeout(150);

  // ---------- D: mi propia fila usa "Debes", la de Fran usa "Le deben" (nunca "yo") ----------
  const balances = await page.evaluate(() => {
    const filas = Array.from(document.querySelectorAll('.split-row')).map(el => el.textContent);
    return filas;
  });
  const filaPropia = balances.find(f => f.includes('test'));
  const filaFran = balances.find(f => f.includes('Fran'));
  check('(D) Mi propia fila de balance dice "Debes" (segunda persona), no "Debe"', filaPropia && /Debes/.test(filaPropia) && !/[^e]Debe /.test(filaPropia), filaPropia);
  check('   y sigue mostrando mi nombre real + "(tú)", nunca "yo"', filaPropia && /test \(tú\)/.test(filaPropia) && !/\byo\b/i.test(filaPropia), filaPropia);
  check('   la fila de Fran usa tercera persona por nombre ("Le deben"), no "Te deben"', filaFran && /Le deben/.test(filaFran), filaFran);

  // ---------- E: el feed y el detalle del gasto muestran el desglose completo, no solo mi parte ----------
  await page.evaluate(() => { window.__debug.state.groupDetailTab = 'gastos'; window.__debug.render(); });
  await page.waitForTimeout(150);
  const feedRow = await page.evaluate(() => {
    const row = document.querySelector('[data-group-expense-open]');
    return row ? row.textContent : null;
  });
  check('(E) El feed de gastos muestra quién pagó y entre quiénes, no solo mi parte', feedRow && /pagó Fran/.test(feedRow) && /entre/.test(feedRow), feedRow);

  await page.click('[data-group-expense-open]');
  await page.waitForTimeout(150);
  const detalle = await page.evaluate(() => document.getElementById('view-root').textContent);
  check('   el detalle muestra el TOTAL del gasto ($20.000)', detalle.includes('$20.000'), detalle.slice(0, 400));
  check('   y cuánto debe CADA participante, no solo "test" -- Fran también aparece con su parte ($10.000)',
    (detalle.match(/\$10\.000/g) || []).length >= 2, detalle.slice(0, 500));

  await finish({ context, browser, errors });
})();
