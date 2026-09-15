// Incidente real: un bug de modo demo (ya corregido, ver shot_modo_demo_datos_sinteticos.js)
// alcanzó a guardar una cuenta real en Supabase con categorías y medios de pago totalmente
// VACÍOS ({}) antes de que el fix llegara -- una cuenta real nunca debería quedar así (toda
// cuenta arranca sembrada con las categorías/medios por defecto, y de ahí solo se agregan o
// renombran, nunca hay un camino legítimo a "cero categorías"). applyStateBlob() ahora detecta
// ese caso (categorías/medios vacíos en el blob cargado) y siembra las categorías/medios por
// defecto en vez de dejar la cuenta en blanco para siempre -- así la cuenta ya afectada se
// autorepara sola la próxima vez que cargue, sin necesitar una migración manual de datos.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    // Simula exactamente el blob roto que quedó guardado en Supabase: categorías/medios vacíos,
    // pero transacciones y todo lo demás reales e intactos (igual que el incidente real).
    const blobRoto = D.emptyAppStateBlob();
    blobRoto.categorias = {};
    blobRoto.mediosPago = {};
    blobRoto.transacciones = [{ id: 'real1', fecha: D.todayISO(), hora: '10:00', comercio: 'Jumbo', monto: 20000, medio: 'tarjeta_0507', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 20000 }], porCobrar: [], reglaAuto: false, nota: '' }];

    D.applyStateBlob(blobRoto);

    return {
      catCount: Object.keys(D.CATEGORIES).length,
      tieneSupermercado: !!D.CATEGORIES.supermercado,
      nombreSupermercado: D.CATEGORIES.supermercado ? D.CATEGORIES.supermercado.nombre : null,
      medioCount: Object.keys(D.PAYMENT_METHODS).length,
      tieneEfectivo: !!D.PAYMENT_METHODS.efectivo,
      txCount: D.buildFullStateBlob().transacciones.length,
    };
  });
  console.log('categorías/medios tras cargar un blob con ambos vacíos:', JSON.stringify(resultado));

  check('Categorías vacías en el blob cargado se siembran solas con las por defecto (no quedan en 0)', resultado.catCount > 5, resultado.catCount);
  check('   incluida "Supermercado", con su nombre real (no un id en blanco)', resultado.tieneSupermercado && resultado.nombreSupermercado === 'Supermercado', resultado);
  check('Medios de pago vacíos se siembran solos con al menos "Efectivo"', resultado.medioCount >= 1 && resultado.tieneEfectivo, resultado);
  check('Las transacciones reales del blob no se tocan (siguen ahí, intactas)', resultado.txCount === 1, resultado.txCount);

  // No debe pisar una cuenta que SÍ tiene categorías/medios reales -- solo actúa cuando están
  // genuinamente vacíos.
  const conDatosReales = await page.evaluate(() => {
    const D = window.__debug;
    const blob = D.emptyAppStateBlob();
    blob.categorias = { mi_categoria_custom: { nombre: 'Mascotas', tipo: 'gasto', colorHue: 199, icon: '🐶' } };
    blob.mediosPago = { mi_tarjeta: { nombre: 'Mi Tarjeta', corto: '•••• 0000', icon: 'card' } };
    D.applyStateBlob(blob);
    return {
      catCount: Object.keys(D.CATEGORIES).length,
      tieneCustom: !!D.CATEGORIES.mi_categoria_custom,
      tieneSupermercado: !!D.CATEGORIES.supermercado,
      tieneTarjetaCustom: !!D.PAYMENT_METHODS.mi_tarjeta,
    };
  });
  check('Una cuenta con categorías/medios NO vacíos no se toca (no se le agregan los por defecto de más)', conDatosReales.catCount === 1 && conDatosReales.tieneCustom && !conDatosReales.tieneSupermercado, conDatosReales);
  check('   y su medio de pago real tampoco se pisa', conDatosReales.tieneTarjetaCustom, conDatosReales);

  await finish({ context, browser, errors });
})();
