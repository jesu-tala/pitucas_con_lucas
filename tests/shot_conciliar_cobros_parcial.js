// Conciliar cobros: vincular un depósito recibido con un por-cobrar pendiente, desde ambos
// lados y con montos PARCIALES (ver assignIncomeToReceivable/receivableEstado en helpers.ts).
// Generaliza el vínculo de antes (resolvePending: todo o nada, un depósito <-> un por-cobrar) a
// pendiente -> parcial -> saldado, varios depósitos a un mismo por-cobrar, y un mismo depósito
// repartido entre varios por-cobrar -- sin crear un mecanismo paralelo (sigue siendo la misma
// fila porCobrar, con un `asignaciones` nuevo). Cubre exactamente los criterios del prompt.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ========== 1) Asignar un depósito reduce el saldo pendiente y NO crea ingreso ==========
  const caso1 = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      { id: 'g1', fecha: '2026-06-01', hora: '10:00', comercio: 'Cena con Fran', monto: 100000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restoranes', monto: 100000 }], porCobrar: [{ persona: 'Fran', monto: 50000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: '' },
      { id: 'd1', fecha: '2026-06-10', hora: '09:00', comercio: 'Transferencia Fran', monto: 20000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    );
    const antes = { estado: D.receivableEstado(D.TRANSACTIONS[0].porCobrar[0]), restante: D.TRANSACTIONS[0].porCobrar[0].monto - D.receivableAssignedTotal(D.TRANSACTIONS[0].porCobrar[0]) };
    const ok = D.assignIncomeToReceivable('g1', 0, 'd1', 20000);
    const p = D.TRANSACTIONS[0].porCobrar[0];
    return {
      ok, antes,
      estado: D.receivableEstado(p),
      asignado: D.receivableAssignedTotal(p),
      restante: p.monto - D.receivableAssignedTotal(p),
      netIncomeDeposito: D.netIncomeTx(D.TRANSACTIONS[1]),
    };
  });
  check('1) assignIncomeToReceivable devuelve true', caso1.ok === true, caso1);
  check('   antes de asignar nada, el por-cobrar está pendiente ($50.000 restantes)', caso1.antes.estado === 'pendiente' && caso1.antes.restante === 50000, caso1.antes);
  check('   tras asignar $20.000, el saldo pendiente baja a $30.000', caso1.restante === 30000, caso1);
  check('   y el depósito NO cuenta como ingreso (netIncomeTx = 0, es un cobro de persona)', caso1.netIncomeDeposito === 0, caso1);

  // ========== 2) Asignación parcial: queda "parcial", el resto sigue pendiente ==========
  const caso2 = await page.evaluate(() => {
    const D = window.__debug;
    const p = D.TRANSACTIONS[0].porCobrar[0];
    return { estado: D.receivableEstado(p) };
  });
  check('2) Tras la asignación parcial de arriba, el por-cobrar queda en estado "parcial" (no "saldado")', caso2.estado === 'parcial', caso2);

  // ========== 3) Varios depósitos a un mismo por-cobrar suman hasta saldarlo ==========
  const caso3 = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push(
      { id: 'd2', fecha: '2026-06-15', hora: '09:00', comercio: 'Transferencia Fran 2', monto: 30000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    );
    const ok = D.assignIncomeToReceivable('g1', 0, 'd2', 30000);
    const p = D.TRANSACTIONS[0].porCobrar[0];
    return { ok, estado: D.receivableEstado(p), asignado: D.receivableAssignedTotal(p), pagado: p.pagado, cantidadAsignaciones: p.asignaciones.length };
  });
  check('3) El segundo depósito completa el saldo -- estado pasa a "saldado"', caso3.estado === 'saldado', caso3);
  check('   el total asignado suma exactamente los $50.000 ($20.000 + $30.000)', caso3.asignado === 50000, caso3);
  check('   pagado también queda en true (siempre derivado del estado, nunca un campo suelto)', caso3.pagado === true, caso3);
  check('   se registraron las 2 asignaciones por separado (trazable, no colapsadas en una)', caso3.cantidadAsignaciones === 2, caso3);

  // ========== 4) Un depósito repartido entre varios por-cobrar asigna cada monto correctamente ==========
  const caso4 = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push(
      { id: 'g2', fecha: '2026-06-02', hora: '11:00', comercio: 'Clínica', monto: 30000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 30000 }], porCobrar: [{ persona: 'Isapre', monto: 30000, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: '' },
      { id: 'g3', fecha: '2026-06-03', hora: '11:00', comercio: 'Almuerzo con Cata', monto: 40000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restoranes', monto: 40000 }], porCobrar: [{ persona: 'Cata', monto: 20000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: '' },
      { id: 'd3', fecha: '2026-06-20', hora: '09:00', comercio: 'Depósito repartido', monto: 50000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    );
    const ok1 = D.assignIncomeToReceivable('g2', 0, 'd3', 30000);
    const ok2 = D.assignIncomeToReceivable('g3', 0, 'd3', 20000);
    const links = D.receivablesLinkedFrom('d3');
    return {
      ok1, ok2, links,
      totalAsignadoDelDeposito: D.incomeAssignedTotal('d3'),
      estadoG2: D.receivableEstado(D.TRANSACTIONS.find(t => t.id === 'g2').porCobrar[0]),
      estadoG3: D.receivableEstado(D.TRANSACTIONS.find(t => t.id === 'g3').porCobrar[0]),
      netIncomeDeposito: D.netIncomeTx(D.TRANSACTIONS.find(t => t.id === 'd3')),
    };
  });
  check('4) Repartir un mismo depósito entre 2 por-cobrar distintos funciona en ambos', caso4.ok1 === true && caso4.ok2 === true, caso4);
  check('   quedan trazables los 2 vínculos, cada uno con su propio monto ($30.000 y $20.000)', caso4.links.length === 2 && caso4.links.some(l => l.montoAsignado === 30000) && caso4.links.some(l => l.montoAsignado === 20000), caso4.links);
  check('   el total asignado del depósito suma exactamente los $50.000 completos', caso4.totalAsignadoDelDeposito === 50000, caso4);
  check('   ambos por-cobrar quedan saldados ($30.000 de $30.000, $20.000 de $20.000)', caso4.estadoG2 === 'saldado' && caso4.estadoG3 === 'saldado', caso4);
  check('   ninguno de los dos genera ingreso (reembolso exacto sin excedente + cobro de persona)', caso4.netIncomeDeposito === 0, caso4);

  // ========== 5) Excedente: si el depósito supera lo debido, el sobrante SÍ cuenta como ingreso ==========
  const caso5 = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push(
      { id: 'g4', fecha: '2026-06-05', hora: '10:00', comercio: 'Urgencia', monto: 60000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 60000 }], porCobrar: [{ persona: 'Isapre', monto: 80000, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: '' },
      { id: 'd4', fecha: '2026-06-25', hora: '09:00', comercio: 'Reembolso Isapre grande', monto: 80000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    );
    const ok = D.assignIncomeToReceivable('g4', 0, 'd4', 80000);
    const gasto = D.TRANSACTIONS.find(t => t.id === 'g4');
    return {
      ok,
      netExpense: D.netExpenseTx(gasto),
      excedente: D.reimbursementExcess(gasto),
      netIncomeDeposito: D.netIncomeTx(D.TRANSACTIONS.find(t => t.id === 'd4')),
      naturaleza: D.incomeNatureOf(D.TRANSACTIONS.find(t => t.id === 'd4')),
    };
  });
  check('5) El gasto ($60.000) nunca queda negativo aunque llegaron $80.000 -- topa en $0', caso5.netExpense === 0, caso5);
  check('   el excedente se calcula bien ($20.000 de los $80.000 recibidos sobre los $60.000 gastados)', caso5.excedente === 20000, caso5);
  check('   ESE excedente sí cuenta como ingreso real (netIncomeTx = 20.000, no 0 ni 80.000)', caso5.netIncomeDeposito === 20000, caso5);
  check('   la naturaleza del depósito sigue siendo "reembolso" (no se reclasifica solo por el excedente)', caso5.naturaleza === 'reembolso', caso5);

  // ========== 6) Trazable desde ambos lados, y se puede deshacer una asignación puntual ==========
  const caso6 = await page.evaluate(() => {
    const D = window.__debug;
    const desdeElGasto = D.TRANSACTIONS.find(t => t.id === 'g2').porCobrar[0].asignaciones;
    const desdeElDeposito = D.receivablesLinkedFrom('d3');
    const quitado = D.removeIncomeAssignment('g2', 0, 'd3');
    const g2Tras = D.TRANSACTIONS.find(t => t.id === 'g2').porCobrar[0];
    return {
      desdeElGasto, desdeElDeposito, quitado,
      estadoG2Tras: D.receivableEstado(g2Tras),
      asignadoG2Tras: D.receivableAssignedTotal(g2Tras),
    };
  });
  check('6) El vínculo se puede leer directo desde la transacción del gasto (asignaciones en su porCobrar)', caso6.desdeElGasto && caso6.desdeElGasto.length === 1 && caso6.desdeElGasto[0].incomeTxId === 'd3', caso6.desdeElGasto);
  check('   y también desde el depósito (receivablesLinkedFrom)', caso6.desdeElDeposito.some(l => l.expenseTxId === 'g2'), caso6.desdeElDeposito);
  check('   se puede deshacer una asignación puntual', caso6.quitado === true, caso6);
  check('   tras deshacerla, ese por-cobrar vuelve a pendiente', caso6.estadoG2Tras === 'pendiente' && caso6.asignadoG2Tras === 0, caso6);

  // ========== UI real: el flujo de 2 pasos (elegir -> monto -> confirmar) funciona de punta a punta ==========
  const uiSetup = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push(
      { id: 'gUI', fecha: '2026-06-01', hora: '10:00', comercio: 'Comida grupal', monto: 40000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restoranes', monto: 40000 }], porCobrar: [{ persona: 'Pancho', monto: 40000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: '' },
      { id: 'dUI', fecha: '2026-06-10', hora: '09:00', comercio: 'Transferencia Pancho', monto: 40000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    );
    D.state.tab = 'transacciones';
    D.state.openTxId = 'gUI';
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  await page.click('[data-link-pending="0"]');
  await page.waitForTimeout(150);
  const pasoUno = await page.evaluate(() => !!document.querySelector('[data-select-income="dUI"]'));
  check('UI (1/4) Abrir "vincular a un depósito" muestra la lista de ingresos para elegir', pasoUno, pasoUno);

  await page.click('[data-select-income="dUI"]');
  await page.waitForTimeout(150);
  const pasoDos = await page.evaluate(() => {
    const input = document.querySelector('[data-link-monto-field]');
    return { hayInput: !!input, valorSugerido: input ? input.value : null, hayConfirmar: !!document.querySelector('[data-link-confirm]') };
  });
  check('UI (2/4) Elegir el depósito pasa al paso 2: un campo de monto, prellenado con lo que corresponde', pasoDos.hayInput && pasoDos.valorSugerido === '40000' && pasoDos.hayConfirmar, pasoDos);

  await page.fill('[data-link-monto-field]', '15.000');
  await page.dispatchEvent('[data-link-monto-field]', 'input');
  await page.waitForTimeout(100);
  await page.click('[data-link-confirm]');
  await page.waitForTimeout(200);
  const trasConfirmar = await page.evaluate(() => {
    const D = window.__debug;
    const p = D.TRANSACTIONS.find(t => t.id === 'gUI').porCobrar[0];
    return { estado: D.receivableEstado(p), asignado: D.receivableAssignedTotal(p), sheetAbierto: document.getElementById('sheet-overlay').classList.contains('open') };
  });
  check('UI (3/4) Confirmar con $15.000 (parcial) asigna exactamente eso, no el depósito completo', trasConfirmar.asignado === 15000 && trasConfirmar.estado === 'parcial', trasConfirmar);
  check('   y vuelve a abrir el detalle del gasto (no se queda pegado en el flujo de vincular)', trasConfirmar.sheetAbierto, trasConfirmar);

  const listaAsignados = await page.evaluate(() => !!Array.from(document.querySelectorAll('.persona-amt')).find(el => /ya pagó/.test(el.textContent)));
  check('UI (4/4) El detalle del gasto ahora muestra "ya pagó $15.000" (parcial, visible sin abrir nada más)', listaAsignados, listaAsignados);

  await finish({ context, browser, errors });
})();
