// Cuando llega un depósito y lo vinculás a un pendiente (un cobro tipo 'persona' o un reembolso),
// ese depósito NO es un ingreso: es la recuperación de algo que ya habías adelantado o gastado.
// La contabilidad ya lo trataba así desde antes -- incomeNatureOf() lo devuelve como
// 'cobro'/'reembolso' y no suma a los ingresos del mes (ver netIncomeTx y monthTotals).
//
// Lo que NO estaba alineado era la representación: el selector de "Tipo" del detalle se dibuja
// desde t.tipo, que sigue siendo 'ingreso' (y debe seguir siéndolo -- de ese campo dependen
// "Entradas" y el cuadre con el banco), así que mostraba "Ingreso" marcado. Y para peor,
// renderIncomeNatureBlock se oculta a propósito para estas dos naturalezas, así que no había
// NINGUNA tarjeta explicando lo contrario. La pantalla decía una cosa y los números otra.
//
// Este test fija las dos mitades: que la UI diga lo que es, y que la plata NO se mueva.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[0];
    const f = d => mes + '-' + String(d).padStart(2, '0');
    D.TRANSACTIONS.length = 0;
    const gasto = (id, d, monto, cat, pc) => ({ id, fecha: f(d), hora: '10:00', comercio: 'Gasto ' + id, monto,
      medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar',
      categorias: [{ cat, monto }], porCobrar: [pc], reglaAuto: false, nota: '' });
    // Los depósitos van categorizados como sueldo A PROPÓSITO: así, ANTES de vincularlos, cuentan
    // como ingreso real completo. Sin eso el test no probaría nada -- un depósito sin categoría ya
    // da 0 por otro motivo, y el "no suma" saldría verde sin que el vínculo hiciera nada.
    const dep = (id, d, monto) => ({ id, fecha: f(d), hora: '11:00', comercio: 'Depósito ' + id, monto,
      medio: 'efectivo', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'sueldo', monto }], porCobrar: [], reglaAuto: false, nota: '' });

    D.TRANSACTIONS.push(gasto('g1', 3, 25000, 'restoranes', { persona: 'Fran', monto: 15000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }));
    D.TRANSACTIONS.push(gasto('g2', 4, 10000, 'salud', { persona: 'Isapre', monto: 10000, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null }));
    D.TRANSACTIONS.push(gasto('g3', 5, 10000, 'salud', { persona: 'Isapre', monto: 10000, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null }));
    D.TRANSACTIONS.push(dep('d1', 6, 15000));   // cobro 'persona', exacto
    D.TRANSACTIONS.push(dep('d2', 7, 10000));   // reembolso exacto
    D.TRANSACTIONS.push(dep('d3', 8, 12000));   // reembolso con 2.000 de sobre-reembolso
    D.state.tab = 'transacciones';
    D.render();
  });
  await page.waitForTimeout(150);

  const abrir = async (id) => { await page.click('[data-tx="' + id + '"]'); await page.waitForTimeout(200); };
  const cerrar = async () => { await page.click('[data-close-sheet-done]'); await page.waitForTimeout(150); };
  const leerHoja = () => page.evaluate(() => {
    const c = document.getElementById('sheet-content');
    const seg = c.querySelector('[data-seg="tipo"]');
    const activo = seg ? (seg.querySelector('button.active') || {}).textContent : null;
    return { texto: c.textContent, haySelector: !!seg, activo };
  });

  // ---------- ANTES de vincular: se comporta como un ingreso normal ----------
  await abrir('d1');
  const antes = await leerHoja();
  check('(antes) un depósito sin vincular muestra el selector de Tipo, con "Ingreso" marcado',
    antes.haySelector === true && antes.activo === 'Ingreso', { haySelector: antes.haySelector, activo: antes.activo });
  await cerrar();

  // Control positivo de la contabilidad: antes de vincular, los tres SÍ suman como ingreso.
  const ingresosAntes = await page.evaluate(() => window.__debug.monthTotals(window.__debug.MONTHS[0]).ingresos);
  check('(control) antes de vincular, los tres depósitos SÍ suman a ingresos ($37.000)',
    ingresosAntes === 37000, ingresosAntes);

  // ---------- Vincular ----------
  const vinculados = await page.evaluate(() => {
    const D = window.__debug;
    const ok = [
      D.assignIncomeToReceivable('g1', 0, 'd1', 15000),
      D.assignIncomeToReceivable('g2', 0, 'd2', 10000),
      D.assignIncomeToReceivable('g3', 0, 'd3', 12000)
    ];
    D.render();
    return ok;
  });
  check('(control) los tres vínculos se crearon de verdad', vinculados.every(Boolean) === true, vinculados);
  await page.waitForTimeout(150);

  // ---------- La UI ahora dice lo que es ----------
  await abrir('d1');
  const cobro = await leerHoja();
  check('un cobro vinculado YA NO se muestra como "Ingreso" (desaparece el selector de Tipo)',
    cobro.haySelector === false, { haySelector: cobro.haySelector, activo: cobro.activo });
  check('   y dice explícitamente que es un cobro recibido', /Cobro recibido/.test(cobro.texto), null);
  check('   explicando por qué no suma (el gasto original ya se contabilizó)',
    /No suma a tus ingresos/.test(cobro.texto), null);
  check('   y sigue ofreciendo "Quitar vínculo" (la salida, ya que el Tipo dejó de ser editable)',
    /Quitar vínculo/.test(cobro.texto), null);
  await cerrar();

  await abrir('d2');
  const reemb = await leerHoja();
  check('un reembolso exacto se muestra como "Reembolso recibido", no como ingreso',
    reemb.haySelector === false && /Reembolso recibido/.test(reemb.texto), { haySelector: reemb.haySelector });
  check('   y NO habla de excedente, porque no hubo', /más de lo que habías gastado/.test(reemb.texto) === false, null);
  await cerrar();

  await abrir('d3');
  const exceso = await leerHoja();
  check('un reembolso con sobre-reembolso también se muestra como "Reembolso recibido"',
    exceso.haySelector === false && /Reembolso recibido/.test(exceso.texto), { haySelector: exceso.haySelector });
  check('   y SÍ explica el excedente, que es la única parte que cuenta como ingreso',
    /más de lo que habías gastado/.test(exceso.texto) && /2\.000/.test(exceso.texto), exceso.texto.slice(0, 400));
  await cerrar();

  // ---------- La contabilidad no se movió por vincular ----------
  const despues = await page.evaluate(() => {
    const D = window.__debug, m = D.MONTHS[0], o = D.monthTotals(m);
    return { ingresos: o.ingresos, entradas: o.entradas, cobros: o.cobros };
  });
  check('vincular NO sube los ingresos del mes: bajan de 37.000 a 2.000 (solo el sobre-reembolso real)',
    despues.ingresos === 2000, despues);
  check('   el cobro se contabiliza aparte, en "cobros"', despues.cobros === 15000, despues);
  check('   y "Entradas" mantiene el total que entró a la cuenta (tiene que cuadrar con el banco)',
    despues.entradas === 37000, despues);

  // ---------- Quitar el vínculo devuelve el selector ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.removeIncomeAssignment('g1', 0, 'd1');
    D.render();
  });
  await page.waitForTimeout(150);
  await abrir('d1');
  const trasDesvincular = await leerHoja();
  check('al quitar el vínculo vuelve el selector de Tipo con "Ingreso" (no queda atrapado)',
    trasDesvincular.haySelector === true && trasDesvincular.activo === 'Ingreso',
    { haySelector: trasDesvincular.haySelector, activo: trasDesvincular.activo });
  await cerrar();

  await finish({ context, browser, errors });
})();
