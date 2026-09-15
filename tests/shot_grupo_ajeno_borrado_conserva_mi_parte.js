// Hallazgo ALTO de la auditoría (una corrección a algo que el informe había dado por seguro).
//
// "Tu parte" de un gasto que registró OTRA persona es una entrada derivada: no se persiste nunca,
// se reconstruye entera desde SHARED_EXPENSES en cada sincronización. Si el grupo completo
// desaparece de tu vista (alguien lo eliminó, o te sacaron), no queda nada desde donde
// reconstruirla y tu historial se borraba solo, sin que hicieras nada y sin copia local.
//
// La app ya había decidido que eso no debía pasar -- deleteGroup() llama a
// preserveGroupTransactionsBeforeUnlink() justo para conservarlas -- pero eso corre SOLO en el
// navegador de quien aprieta el botón. Para los demás miembros la eliminación llega por realtime
// y se llevaba el historial en silencio.
//
// Este test cubre los tres comportamientos que importan, incluido lo que NO debe cambiar.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // El escenario base, dentro del navegador: un gasto que pagó y registró OTRA persona, donde a
  // mí me toca la mitad -- o sea, una entrada derivada "tu parte".
  await page.evaluate(() => {
    window.fixtureFn = function (D) {
      D.currentUser = { id: 'user-yo' };
      D.TRANSACTIONS.length = 0;
      D.GROUPS = [{ id: 'g1', nombre: 'Depto', icono: '🏠', creado_por: 'user-otro', invite_code: 'x', created_at: '' }];
      D.GROUP_PARTICIPANTS = [
        { id: 'pYo', grupo_id: 'g1', user_id: 'user-yo', nombre: 'Yo', color: 'lavender' },
        { id: 'pOtro', grupo_id: 'g1', user_id: 'user-otro', nombre: 'Caro', color: 'mint' }
      ];
      D.SHARED_EXPENSES = [{
        id: 'se1', grupo_id: 'g1', descripcion: 'Supermercado', categoria_origen: null, monto: 40000,
        fecha: '2026-09-10', pagado_por: 'pOtro', registrado_por: 'user-otro',
        division_tipo: 'iguales', tx_origen_id: null,
        reparto: [
          { id: 'r1', gasto_compartido_id: 'se1', participante_id: 'pYo', monto: 20000 },
          { id: 'r2', gasto_compartido_id: 'se1', participante_id: 'pOtro', monto: 20000 }
        ]
      }];
      D.syncSharedExpenses();
    };
  });

  // ---------- 1) El grupo entero desaparece (lo borró otra persona) ----------
  const caso1 = await page.evaluate(() => {
    const D = window.__debug;
    fixtureFn(D);
    const antes = D.TRANSACTIONS.filter(t => t.sharedByOthers).map(t => ({ id: t.id, monto: t.monto }));

    // Así llega la eliminación de otra persona: loadSharedExpenses() vuelve a traer todo y ya no
    // viene nada, y recién ahí corre la sincronización.
    D.GROUPS = []; D.GROUP_PARTICIPANTS = []; D.SHARED_EXPENSES = [];
    D.syncSharedExpenses();

    const persistidas = D.buildFullStateBlob().transacciones;
    const conservada = persistidas.find(t => t.id === 'compartido-se1');
    return {
      antes,
      conservada: conservada ? { monto: conservada.monto, fecha: conservada.fecha, sharedByOthers: !!conservada.sharedByOthers, groupId: conservada.groupId, origen: conservada.origen, nota: conservada.nota } : null,
      totalPersistidas: persistidas.length
    };
  });
  check('(setup) antes de borrar el grupo, existe tu parte derivada ($20.000)', caso1.antes.length === 1 && caso1.antes[0].monto === 20000, caso1.antes);
  check('1) al desaparecer el grupo, tu parte NO se pierde', caso1.conservada !== null, caso1);
  check('   queda con el mismo monto y fecha', caso1.conservada && caso1.conservada.monto === 20000 && caso1.conservada.fecha === '2026-09-10', caso1.conservada);
  check('   y ahora SÍ se persiste (deja de ser derivada, entra en el blob que se guarda)', caso1.conservada && caso1.conservada.sharedByOthers === false, caso1.conservada);
  check('   desvinculada del grupo que ya no existe', caso1.conservada && !caso1.conservada.groupId, caso1.conservada);
  check('   marcada como movimiento propio (origen manual: una cartola nunca va a proponer borrarla)', caso1.conservada && caso1.conservada.origen === 'manual', caso1.conservada);

  // ---------- 2) Lo que NO debe cambiar: borrar UN gasto puntual sigue siendo una corrección ----------
  const caso2 = await page.evaluate(() => {
    const D = window.__debug;
    fixtureFn(D);
    // El grupo sigue existiendo y sigo adentro; solo desaparece ese gasto (quien lo registró lo
    // borró porque estaba mal). Eso debe seguir propagándose, como siempre.
    D.SHARED_EXPENSES = [];
    D.syncSharedExpenses();
    const persistidas = D.buildFullStateBlob().transacciones;
    return { sigueAlguna: persistidas.some(t => t.id === 'compartido-se1'), total: persistidas.length };
  });
  check('2) si el grupo sigue y solo se borró ese gasto, tu parte se va (es una corrección, no una pérdida)', caso2.sigueAlguna === false, caso2);

  // ---------- 3) Sin duplicados si el grupo vuelve (te sacaron y te re-agregaron) ----------
  const caso3 = await page.evaluate(() => {
    const D = window.__debug;
    fixtureFn(D);
    const gruposOriginales = JSON.parse(JSON.stringify(D.GROUPS));
    const participantesOriginales = JSON.parse(JSON.stringify(D.GROUP_PARTICIPANTS));
    const gastosOriginales = JSON.parse(JSON.stringify(D.SHARED_EXPENSES));

    D.GROUPS = []; D.GROUP_PARTICIPANTS = []; D.SHARED_EXPENSES = [];
    D.syncSharedExpenses();                       // se conserva como movimiento propio

    D.GROUPS = gruposOriginales;                  // vuelve todo
    D.GROUP_PARTICIPANTS = participantesOriginales;
    D.SHARED_EXPENSES = gastosOriginales;
    D.syncSharedExpenses();

    const todas = D.buildFullStateBlob().transacciones.concat(D.TRANSACTIONS.filter(t => t.sharedByOthers));
    return { cuantas: todas.filter(t => t.id === 'compartido-se1').length };
  });
  check('3) si el grupo vuelve, no queda duplicada (una sola entrada, la que ya estaba guardada)', caso3.cuantas === 1, caso3);

  await finish({ context, browser, errors });
})();
