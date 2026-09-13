// Feature: tratar un reembolso como "contra-gasto", no como ingreso. Antes, un reembolso
// (isapre/seguro/empleador) no aterrizaba en ninguna parte: netExpenseTx solo netaba las filas
// porCobrar tipo 'persona' (splits con amigos), ignorando 'reembolso' por completo -- así que
// una clínica de $1.000.000 con $800.000 de reembolso seguía mostrando $1.000.000 gastados en la
// categoría, en vez del costo real ($200.000). Y si el depósito del reembolso se vinculaba al
// pendiente, contaba como ingreso completo (incomeIsPersonSettlement solo excluía 'persona').
//
// Ahora netExpenseTx/catNetAmount también netean 'reembolso' (Caso A: ya sabías que venía,
// marcado porCobrar desde el registro -- Caso B: llegó sin avisar, se aplica después contra el
// gasto elegido, ver applyUnexpectedReimbursement) y netIncomeTx excluye el depósito vinculado
// de "Ingreso" -- salvo el excedente de un sobre-reembolso, que sí es plata real.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ================= Caso A: reembolso esperado (marcado porCobrar al registrar) =================
  const casoA = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.MONTHS.length = 0;
    D.MONTHS.push('2026-06');
    D.TRANSACTIONS.push({
      id: 'gastoA', fecha: '2026-06-05', hora: '10:00', comercio: 'Clínica Alemana', monto: 1000000,
      medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar',
      categorias: [{ cat: 'salud', monto: 1000000 }],
      porCobrar: [{ persona: 'Isapre', monto: 800000, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null }],
      reglaAuto: false, nota: ''
    });
    const antesDeCobrar = {
      netExpense: D.netExpenseTx(D.TRANSACTIONS[0]),
      catMonthExpense: D.catMonthExpense('salud', '2026-06'),
      ingresosDelMes: D.monthTotals('2026-06').ingresos,
    };
    // Llega la plata: un depósito real de $800.000, todavía sin vincular a nada.
    D.TRANSACTIONS.push({
      id: 'depositoA', fecha: '2026-06-20', hora: '09:00', comercio: 'Transferencia Isapre', monto: 800000,
      medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado',
      categorias: [], porCobrar: [], reglaAuto: false, nota: ''
    });
    const ok = D.resolvePending('gastoA', 0, 'depositoA');
    const despuesDeCobrar = {
      resolvePendingOk: ok,
      netExpense: D.netExpenseTx(D.TRANSACTIONS[0]),
      catMonthExpense: D.catMonthExpense('salud', '2026-06'),
      netIncomeDeposito: D.netIncomeTx(D.TRANSACTIONS[1]),
      ingresosDelMes: D.monthTotals('2026-06').ingresos,
      gastosDelMes: D.monthTotals('2026-06').gastos,
    };
    return { antesDeCobrar, despuesDeCobrar };
  });
  check('Caso A: apenas se marca el reembolso esperado, el neto ya baja a $200.000 (no espera a que llegue la plata)',
    casoA.antesDeCobrar.netExpense === 200000, casoA.antesDeCobrar);
  check('   y la composición por categoría (salud) también muestra el neto, $200.000, no el bruto $1.000.000',
    casoA.antesDeCobrar.catMonthExpense === 200000, casoA.antesDeCobrar);
  check('Vincular el depósito al pendiente funciona (resolvePending)', casoA.despuesDeCobrar.resolvePendingOk === true, casoA.despuesDeCobrar);
  check('   y el neto del gasto NO se mueve al cobrar: sigue en $200.000', casoA.despuesDeCobrar.netExpense === 200000, casoA.despuesDeCobrar);
  check('   la categoría tampoco se mueve: sigue en $200.000', casoA.despuesDeCobrar.catMonthExpense === 200000, casoA.despuesDeCobrar);
  check('   el depósito de $800.000 NO cuenta como ingreso (netIncomeTx = 0)', casoA.despuesDeCobrar.netIncomeDeposito === 0, casoA.despuesDeCobrar);
  check('   monthTotals().ingresos NO subió con el depósito (el reembolso no infla el ingreso)',
    casoA.despuesDeCobrar.ingresosDelMes === casoA.antesDeCobrar.ingresosDelMes, casoA.despuesDeCobrar);
  check('   monthTotals().gastos del mes refleja el neto ($200.000), no el bruto', casoA.despuesDeCobrar.gastosDelMes === 200000, casoA.despuesDeCobrar);

  // ================= Caso B: reembolso inesperado (llega sin haberlo anticipado) =================
  const casoB = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.MONTHS.length = 0;
    D.MONTHS.push('2026-07');
    D.TRANSACTIONS.push(
      { id: 'gastoB', fecha: '2026-07-03', hora: '10:00', comercio: 'Farmacia Cruz Verde', monto: 500000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'salud', monto: 500000 }], porCobrar: [], reglaAuto: false, nota: '' },
      { id: 'depositoB', fecha: '2026-07-15', hora: '09:00', comercio: 'Transferencia Seguro', monto: 300000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    );
    const antes = { netExpense: D.netExpenseTx(D.TRANSACTIONS[0]), catMonthExpense: D.catMonthExpense('salud', '2026-07') };
    const ok = D.applyUnexpectedReimbursement('gastoB', 'depositoB');
    const gastoB = D.TRANSACTIONS.find(t => t.id === 'gastoB');
    return {
      aplicadoOk: ok, estado: gastoB.estado, porCobrar: gastoB.porCobrar,
      antes,
      despuesNetExpense: D.netExpenseTx(gastoB),
      despuesCatMonthExpense: D.catMonthExpense('salud', '2026-07'),
      netIncomeDeposito: D.netIncomeTx(D.TRANSACTIONS[1]),
    };
  });
  check('Caso B: antes de aplicar el reembolso, el gasto cuenta completo ($500.000)', casoB.antes.netExpense === 500000, casoB.antes);
  check('applyUnexpectedReimbursement aplica el reembolso al gasto elegido', casoB.aplicadoOk === true, casoB);
  check('   crea la fila "reembolso" ya pagada, vinculada al depósito', casoB.porCobrar.length === 1 && casoB.porCobrar[0].tipo === 'reembolso' && casoB.porCobrar[0].pagado === true && casoB.porCobrar[0].montoRecibido === 300000 && casoB.porCobrar[0].linkedTxId === 'depositoB', casoB.porCobrar);
  check('   el gasto queda en estado "por_cobrar" (para que se vea el tag "Reembolso")', casoB.estado === 'por_cobrar', casoB.estado);
  check('   el neto del gasto baja a $200.000 (500.000-300.000)', casoB.despuesNetExpense === 200000, casoB);
  check('   y la categoría correcta (salud) muestra ese mismo neto, $200.000', casoB.despuesCatMonthExpense === 200000, casoB);
  check('   el depósito aplicado como reembolso inesperado tampoco cuenta como ingreso', casoB.netIncomeDeposito === 0, casoB);

  // ================= Caso B vía UI real: picker "¿Es un reembolso que no esperabas?" =================
  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      { id: 'gastoUI', fecha: '2026-07-03', hora: '10:00', comercio: 'Clínica Las Condes', monto: 400000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'salud', monto: 400000 }], porCobrar: [], reglaAuto: false, nota: '' },
      { id: 'depositoUI', fecha: '2026-07-15', hora: '09:00', comercio: 'Transferencia Isapre', monto: 150000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    );
    D.state.tab = 'transacciones';
    D.state.openTxId = 'depositoUI';
    D.state.creatingNew = false;
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-open-link-income="depositoUI"]');
  await page.waitForTimeout(150);
  const sinGastosAunVisibles = await page.evaluate(() => !document.querySelector('[data-pick-gasto-reembolso]'));
  check('El picker de "reembolso inesperado" arranca oculto (no satura la lista de pendientes)', sinGastosAunVisibles);
  await page.click('[data-toggle-mostrar-gastos-reembolso]');
  await page.waitForTimeout(150);
  const conGastoVisible = await page.evaluate(() => !!document.querySelector('[data-pick-gasto-reembolso="gastoUI"]'));
  check('Tocar "¿Es un reembolso que no esperabas?" muestra los gastos para elegir', conGastoVisible);
  await page.click('[data-pick-gasto-reembolso="gastoUI"]');
  await page.waitForTimeout(150);
  const trasElegirUI = await page.evaluate(() => {
    const g = window.__debug.TRANSACTIONS.find(t => t.id === 'gastoUI');
    return { netExpense: window.__debug.netExpenseTx(g), vinculadoTexto: document.getElementById('sheet-content').textContent };
  });
  check('Elegir el gasto desde la UI real aplica el reembolso (neto baja a $250.000)', trasElegirUI.netExpense === 250000, trasElegirUI.netExpense);
  check('   y el detalle del depósito muestra que quedó vinculado', trasElegirUI.vinculadoTexto.includes('Vinculado a'), trasElegirUI.vinculadoTexto);

  // ================= Sobre-reembolso: te devuelven más de lo que gastaste =================
  const sobreReembolso = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.MONTHS.length = 0;
    D.MONTHS.push('2026-08');
    D.TRANSACTIONS.push(
      { id: 'gastoC', fecha: '2026-08-05', hora: '10:00', comercio: 'Consulta médica', monto: 200000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 200000 }], porCobrar: [{ persona: 'Isapre', monto: 200000, pagado: true, tipo: 'reembolso', montoRecibido: 250000, linkedTxId: 'depositoC' }], reglaAuto: false, nota: '' },
      { id: 'depositoC', fecha: '2026-08-20', hora: '09:00', comercio: 'Transferencia Isapre', monto: 250000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    );
    const gastoC = D.TRANSACTIONS[0], depositoC = D.TRANSACTIONS[1];
    return {
      netExpense: D.netExpenseTx(gastoC),
      catMonthExpense: D.catMonthExpense('salud', '2026-08'),
      excedente: D.reimbursementExcess(gastoC),
      netIncomeDeposito: D.netIncomeTx(depositoC),
      ingresosDelMes: D.monthTotals('2026-08').ingresos,
    };
  });
  check('Sobre-reembolso: el neto del gasto topa en $0 (nunca queda negativo)', sobreReembolso.netExpense === 0, sobreReembolso);
  check('   la categoría (salud) también topa en $0', sobreReembolso.catMonthExpense === 0, sobreReembolso);
  check('   el excedente ($50.000 de los $250.000 recibidos sobre los $200.000 gastados) se calcula bien', sobreReembolso.excedente === 50000, sobreReembolso);
  check('   y ESE excedente sí cuenta como ingreso real (netIncomeTx = 50.000, no 0 ni 250.000)', sobreReembolso.netIncomeDeposito === 50000, sobreReembolso);
  check('   monthTotals().ingresos del mes refleja exactamente ese excedente ($50.000)', sobreReembolso.ingresosDelMes === 50000, sobreReembolso);

  await finish({ context, browser, errors });
})();
