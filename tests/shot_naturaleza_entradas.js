// Feature: taxonomía de entradas -- separar "Ingreso" real de todo lo demás que entra a la
// cuenta (reembolsos, cobros, rescates de inversión, ventas de activos, traspasos entre cuentas
// propias). Antes, el cuadro "Ingresos" sumaba TODO lo que entraba, inflando tasa de ahorro/%
// de inversión/objetivo de inversión. Ahora cada entrada tiene una naturaleza (IncomeNature,
// types.ts) -- 'ingreso' | 'reembolso' | 'cobro' | 'movimiento_capital' | 'por_clasificar' --
// derivada centralizadamente (incomeNatureOf, helpers.ts) de su vínculo porCobrar existente o su
// categoría, nunca re-calculada por separado en cada vista. Solo 'ingreso' (y el sobre-reembolso
// de un 'reembolso') cuenta para los ratios; todo lo demás sigue sumando en "Entradas" (flujo de
// caja) pero no en "Ingreso".
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    const mes = '2026-08';
    D.TRANSACTIONS.length = 0;
    D.MONTHS.length = 0;
    D.MONTHS.push(mes);
    D.TRANSACTIONS.push(
      // 1) Ingreso real: sueldo -- categoría inequívoca, cuenta como 'ingreso' sin que nadie lo marque.
      { id: 'sueldo', fecha: mes + '-05', hora: '09:00', comercio: 'Sueldo Agosto', monto: 1000000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: 1000000 }], porCobrar: [], reglaAuto: false, nota: '' },
      // 2) Reembolso YA recibido (sin sobre-reembolso): el depósito vinculado no debe sumar nada
      //    en Ingreso -- ya se restó del gasto original (contra-gasto).
      { id: 'gastoClinica', fecha: mes + '-06', hora: '10:00', comercio: 'Clínica', monto: 1000000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 1000000 }], porCobrar: [{ persona: 'Isapre', monto: 800000, pagado: true, tipo: 'reembolso', montoRecibido: 800000, linkedTxId: 'depositoReembolso' }], reglaAuto: false, nota: '' },
      { id: 'depositoReembolso', fecha: mes + '-20', hora: '09:00', comercio: 'Transferencia Isapre', monto: 800000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' },
      // 3) Cobro: Fran te devuelve su parte de un gasto compartido -- tampoco es ingreso.
      { id: 'cenaCompartida', fecha: mes + '-07', hora: '20:00', comercio: 'Cena', monto: 20000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restoranes', monto: 20000 }], porCobrar: [{ persona: 'Fran', monto: 10000, pagado: true, tipo: 'persona', montoRecibido: 10000, linkedTxId: 'depositoCobro', direccion: 'me_deben' }], reglaAuto: false, nota: '' },
      { id: 'depositoCobro', fecha: mes + '-08', hora: '09:00', comercio: 'Transferencia de Fran', monto: 10000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' },
      // 4) "Rescate de inversión" registrado como ingreso con categoría ambigua/personalizada --
      //    sin clasificar a mano, arranca "por clasificar" (nunca "ingreso" en silencio).
      { id: 'rescate', fecha: mes + '-10', hora: '09:00', comercio: 'Rescate Fintual', monto: 300000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'otros_ingreso_custom', monto: 300000 }], porCobrar: [], reglaAuto: false, nota: '' },
      // 5) Venta de un activo -- misma idea, ya reclasificada A MANO como movimiento de capital
      //    (probando el "tap" explícito, no solo el default).
      { id: 'ventaActivo', fecha: mes + '-11', hora: '09:00', comercio: 'Venta bicicleta antigua', monto: 150000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'otros_ingreso_custom', monto: 150000 }], porCobrar: [], reglaAuto: false, nota: '', naturalezaEntrada: 'movimiento_capital' },
      // 6) Traspaso entre cuentas propias -- mismo caso, marcado a mano.
      { id: 'traspaso', fecha: mes + '-12', hora: '09:00', comercio: 'Traspaso a cuenta de ahorro', monto: 200000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'otros_ingreso_custom', monto: 200000 }], porCobrar: [], reglaAuto: false, nota: '', naturalezaEntrada: 'movimiento_capital' },
      // Un aporte real a inversión, para que tasaAhorro/tasaGastos tengan sentido.
      { id: 'aporteInversion', fecha: mes + '-15', hora: '09:00', comercio: 'Aporte Fintual', monto: 100000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'm1', monto: 100000 }], porCobrar: [], reglaAuto: false, nota: '' }
    );

    const naturalezas = {
      sueldo: D.incomeNatureOf(D.TRANSACTIONS.find(t => t.id === 'sueldo')),
      depositoReembolso: D.incomeNatureOf(D.TRANSACTIONS.find(t => t.id === 'depositoReembolso')),
      depositoCobro: D.incomeNatureOf(D.TRANSACTIONS.find(t => t.id === 'depositoCobro')),
      rescate: D.incomeNatureOf(D.TRANSACTIONS.find(t => t.id === 'rescate')),
      ventaActivo: D.incomeNatureOf(D.TRANSACTIONS.find(t => t.id === 'ventaActivo')),
      traspaso: D.incomeNatureOf(D.TRANSACTIONS.find(t => t.id === 'traspaso')),
    };
    const mt = D.monthTotals(mes);
    return { naturalezas, mt };
  });

  // ---------- Clasificación individual ----------
  check('Sueldo se clasifica como "ingreso" sin que nadie lo marque (categoría inequívoca)', resultado.naturalezas.sueldo === 'ingreso', resultado.naturalezas.sueldo);
  check('El depósito del reembolso se clasifica como "reembolso" (por el vínculo, no por categoría)', resultado.naturalezas.depositoReembolso === 'reembolso', resultado.naturalezas.depositoReembolso);
  check('El depósito del cobro se clasifica como "cobro"', resultado.naturalezas.depositoCobro === 'cobro', resultado.naturalezas.depositoCobro);
  check('Migración: el "rescate" con categoría ambigua queda "por_clasificar" -- NUNCA ingreso en silencio', resultado.naturalezas.rescate === 'por_clasificar', resultado.naturalezas.rescate);
  check('La venta de activo reclasificada a mano queda "movimiento_capital"', resultado.naturalezas.ventaActivo === 'movimiento_capital', resultado.naturalezas.ventaActivo);
  check('El traspaso reclasificado a mano también queda "movimiento_capital"', resultado.naturalezas.traspaso === 'movimiento_capital', resultado.naturalezas.traspaso);

  // ---------- La card "Ingreso" suma SOLO naturaleza = ingreso ----------
  check('monthTotals().ingresos = SOLO el sueldo ($1.000.000) -- reembolso/cobro/rescate/venta/traspaso quedan afuera',
    resultado.mt.ingresos === 1000000, resultado.mt.ingresos);

  // ---------- Ratios sobre ingreso real, no sobre el total de entradas ----------
  // tasaAhorro = inversiones/ingresos = 100.000/1.000.000 = 10% -- si usara el total de entradas
  // (mucho más grande, con reembolso+cobro+rescate+venta+traspaso sumados) daría un % mucho menor.
  check('tasaAhorro se calcula sobre el ingreso REAL (10%), no sobre el total de entradas (que daría un % mucho menor)',
    Math.abs(resultado.mt.tasaAhorro - 10) < 0.01, resultado.mt.tasaAhorro);

  // ---------- "Entradas total" = suma exacta de las naturalezas, sin doble conteo del reembolso ----------
  // entradas = sueldo(1.000.000) + depósito reembolso BRUTO(800.000, no solo el sobre-reembolso)
  // + depósito cobro(10.000) + rescate(300.000) + venta(150.000) + traspaso(200.000) = 2.460.000
  check('monthTotals().entradas suma TODAS las naturalezas (incluido el reembolso, una sola vez)',
    resultado.mt.entradas === 2460000, resultado.mt.entradas);
  check('   cobros = $10.000 (el depósito de Fran)', resultado.mt.cobros === 10000, resultado.mt.cobros);
  check('   movimientoCapital = $350.000 (venta $150.000 + traspaso $200.000)', resultado.mt.movimientoCapital === 350000, resultado.mt.movimientoCapital);
  check('   porClasificar = $300.000 (el rescate, todavía sin resolver)', resultado.mt.porClasificar === 300000, resultado.mt.porClasificar);

  // ---------- Sobre-reembolso: el excedente SÍ cuenta como ingreso (verificación cruzada) ----------
  const sobreReembolso = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.MONTHS.length = 0;
    D.MONTHS.push('2026-09');
    D.TRANSACTIONS.push(
      { id: 'gastoC', fecha: '2026-09-05', hora: '10:00', comercio: 'Consulta médica', monto: 200000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 200000 }], porCobrar: [{ persona: 'Isapre', monto: 200000, pagado: true, tipo: 'reembolso', montoRecibido: 250000, linkedTxId: 'depositoC' }], reglaAuto: false, nota: '' },
      { id: 'depositoC', fecha: '2026-09-20', hora: '09:00', comercio: 'Transferencia Isapre', monto: 250000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' }
    );
    return D.monthTotals('2026-09');
  });
  check('Sobre-reembolso: el excedente ($50.000) SÍ cuenta dentro de "Ingreso" (naturaleza reembolso, pero excedente real)',
    sobreReembolso.ingresos === 50000, sobreReembolso.ingresos);
  check('   y "Entradas" sigue sumando el depósito completo ($250.000), sin doble contar el excedente',
    sobreReembolso.entradas === 250000, sobreReembolso.entradas);

  // ---------- UI: "por clasificar" ofrece el tap para reclasificar ----------
  await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.push({ id: 'txAmbigua', fecha: D.todayISO(), hora: '09:00', comercio: 'Retiro Buda', monto: 50000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'otros_ingreso_custom', monto: 50000 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.state.openTxId = 'txAmbigua';
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(150);
  const tieneTap = await page.evaluate(() => ({
    tieneBotonIngreso: !!document.querySelector('[data-action="naturaleza-ingreso"][data-tx="txAmbigua"]'),
    tieneBotonCapital: !!document.querySelector('[data-action="naturaleza-capital"][data-tx="txAmbigua"]'),
  }));
  check('Una entrada "por clasificar" ofrece el tap "Es ingreso real"', tieneTap.tieneBotonIngreso, tieneTap);
  check('   y también "Es movimiento de capital"', tieneTap.tieneBotonCapital, tieneTap);

  await page.click('[data-action="naturaleza-capital"][data-tx="txAmbigua"]');
  await page.waitForTimeout(150);
  const trasClasificar = await page.evaluate(() => {
    const D = window.__debug;
    return D.incomeNatureOf(D.TRANSACTIONS.find(t => t.id === 'txAmbigua'));
  });
  check('Tocar "Es movimiento de capital" reclasifica de verdad (queda guardado en la transacción)', trasClasificar === 'movimiento_capital', trasClasificar);

  await finish({ context, browser, errors });
})();
