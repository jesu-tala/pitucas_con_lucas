// Reporte real tras el deploy del arreglo de cuotas: "no veo que se haya arreglado lo de las
// cuotas". Causa: el arreglo de applyCuotaMonto (events.ts/helpers.ts) solo actúa hacia
// adelante, al tocar el switch/stepper de "Pago en cuotas" -- una compra en cuotas que ya estaba
// guardada en Supabase DESDE ANTES del arreglo seguía con el monto en el precio TOTAL de la
// compra (cuotas.montoTotal ni existía todavía), y sus meses proyectados seguían repitiendo ese
// mismo total. Igual que con "pendientes" (shot_pendientes_repara_datos_viejos.js), applyStateBlob
// ahora sana este caso también al cargar la cuenta.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    const blob = D.emptyAppStateBlob();
    // Formato VIEJO: monto = precio total ($90.000), sin cuotas.montoTotal -- tal cual quedaba
    // guardado antes del arreglo. La cuota proyectada del mes siguiente también repite el total.
    blob.transacciones = [
      { id: 'cuotaVieja', fecha: '2026-08-10', hora: '16:20', comercio: 'Falabella Vieja', monto: 90000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 90000 }], porCobrar: [], reglaAuto: false, nota: '', cuotas: { total: 3 } },
      { id: 'cuotaVieja-c2', fecha: '2026-09-10', hora: '16:20', comercio: 'Falabella Vieja', monto: 90000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 90000 }], porCobrar: [], cuotaOf: 'cuotaVieja', cuotaNumero: 2, cuotaTotal: 3, cuotaProyectada: true }
    ];
    D.applyStateBlob(blob);
    // applyStateBlob reasigna internamente TRANSACTIONS -- window.__debug.TRANSACTIONS queda
    // apuntando al arreglo viejo (staleness ya documentada en otros tests), así que se lee un
    // snapshot fresco vía buildFullStateBlob.
    return D.buildFullStateBlob().transacciones;
  });

  const raiz = resultado.find(t => t.id === 'cuotaVieja');
  check('La raíz vieja pasa de $90.000 (precio total) a $30.000 (la cuota de ese mes)', raiz && raiz.monto === 30000 && raiz.categorias[0].monto === 30000, raiz);
  check('Se le agrega cuotas.montoTotal con el precio original ($90.000), para poder recalcular', raiz && raiz.cuotas.montoTotal === 90000, raiz && raiz.cuotas);

  const cuota2 = resultado.find(t => t.id === 'cuotaVieja-c2');
  const cuota3 = resultado.find(t => t.cuotaOf === 'cuotaVieja' && t.cuotaNumero === 3);
  check('La cuota 2 (regenerada) también queda en $30.000, no en $90.000', cuota2 && cuota2.monto === 30000, cuota2);
  check('Y aparece la cuota 3 (regenerada desde cero junto con la raíz sanada)', !!cuota3 && cuota3.monto === 30000, cuota3);

  await finish({ context, browser, errors });
})();
