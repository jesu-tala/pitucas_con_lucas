// Una compra en cuotas aparece en la cartola de tarjeta con el monto de la OPERACIÓN completa
// ($360.000) en monto_op y la cuota que se cobra ESTE mes ($30.000) en valor_cuota, con "03/12"
// en ncuota. El parser usaba siempre monto_op, y eso rompía la reconciliación de la peor forma:
// la app guarda cada cuota proyectada por el monto de la CUOTA, así que la línea de $360.000 no
// calzaba con nada y el diff proponía LAS DOS COSAS a la vez -- agregar un gasto nuevo de
// $360.000 (que no es plata que salió este mes) y ELIMINAR la cuota proyectada correcta de
// $30.000 "por no estar respaldada". Aceptar ese diff borraba el dato bueno y dejaba uno inflado
// doce veces, todos los meses.
//
// Este test fija que la línea de la cartola calce contra la cuota proyectada que corresponde, y
// que el número de cuota desempate entre cuotas que son idénticas en todo lo demás.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push({ id: 'compra', fecha: '2026-07-15', hora: '12:00', comercio: 'Falabella',
      monto: 30000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'compras', monto: 30000 }], porCobrar: [], reglaAuto: false, nota: '',
      cuotas: { total: 12, montoTotal: 360000 }, origen: 'auto-mail' });
    D.regenerateInstallmentsFor('compra');
    // regenerateInstallmentsFor usa setTransactions(), que REASIGNA el array: D.TRANSACTIONS
    // queda apuntando al viejo. buildFullStateBlob() lee el binding vivo del módulo.
    const vivas = D.buildFullStateBlob().transacciones;
    const cuota3 = vivas.find(t => t.cuotaProyectada && t.cuotaNumero === 3);

    const linea = (monto, nCuota, id) => ({
      fecha: cuota3.fecha, detalle: 'FALABELLA', comercioSugerido: 'FALABELLA',
      monto: -monto, tipoMov: 'gasto', esEspecial: null, fuenteLineaId: id,
      cuotaNumero: nCuota, cuotaTotal: nCuota ? 12 : undefined
    });
    const resumen = (d) => ({
      agregar: d.agregar.length,
      agregarMonto: d.agregar[0] ? Math.abs(d.agregar[0].movimiento.monto) : null,
      eliminar: d.eliminarPropuesto.length,
      eliminaria: d.eliminarPropuesto[0] ? d.eliminarPropuesto[0].tx.id : null,
      revisar: d.revisar.length
    });

    return {
      cuotasGeneradas: vivas.filter(t => t.cuotaProyectada).length,
      cuota3: cuota3 ? { id: cuota3.id, monto: cuota3.monto, fecha: cuota3.fecha } : null,
      // Lo que el parser manda AHORA: el valor de la cuota, con su número.
      conValorCuota: resumen(D.buildReconcileDiff([linea(30000, 3, 'ln_ok')], 'tarjeta_nacional')),
      // Lo que mandaba antes: el monto de la operación completa.
      conMontoOperacion: resumen(D.buildReconcileDiff([linea(360000, 3, 'ln_op')], 'tarjeta_nacional')),
      // Mismo monto y comercio, pero la cartola dice que es OTRA cuota.
      conCuotaEquivocada: resumen(D.buildReconcileDiff([linea(30000, 7, 'ln_7')], 'tarjeta_nacional'))
    };
  });

  // Controles positivos: sin las cuotas proyectadas generadas, todo lo de abajo pasaría en verde
  // sin haber comparado nada.
  check('(control) se generaron las 11 cuotas proyectadas', r.cuotasGeneradas === 11, r.cuotasGeneradas);
  check('(control) la cuota 3 existe y vale la CUOTA, no la compra completa',
    !!r.cuota3 && r.cuota3.monto === 30000, r.cuota3);

  check('la línea de la cartola calza contra la cuota proyectada: no propone nada',
    r.conValorCuota.agregar === 0 && r.conValorCuota.eliminar === 0 && r.conValorCuota.revisar === 0, r.conValorCuota);

  check('(regresión) con el monto de la operación completa proponía un gasto nuevo de $360.000',
    r.conMontoOperacion.agregar === 1 && r.conMontoOperacion.agregarMonto === 360000, r.conMontoOperacion);
  check('   y además proponía ELIMINAR la cuota proyectada correcta',
    r.conMontoOperacion.eliminar === 1 && r.conMontoOperacion.eliminaria === 'compra-c3', r.conMontoOperacion);

  check('el número de cuota desempata: "cuota 7" no calza con la cuota 3 aunque monto y comercio sean idénticos',
    r.conCuotaEquivocada.agregar === 1, r.conCuotaEquivocada);

  await finish({ context, browser, errors });
})();
