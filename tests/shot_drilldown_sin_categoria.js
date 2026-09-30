// Balance > "Gastos por categoría": tocar el segmento "Sin categoría" del donut llevaba a la
// lista de transacciones filtrada... y vacía.
//
// La causa: "Sin categoría" es el único filtro que NO es un id real. catBucketId() lo inventa
// (SIN_CATEGORIA_ID = '__sin_categoria') para juntar en un solo segmento todo lo que no resuelve
// -- una categoría borrada, un null, un id viejo -- porque si no el donut dibujaba un segmento
// por cada id roto distinto, todos rotulados igual. Pero ninguna transacción lleva ese id
// escrito, y categoryFilterMatches comparaba por igualdad, así que el filtro no encontraba nada.
//
// El caso real que lo produce: clasificas un gasto, después borras esa categoría. La
// transacción se queda con el id de una categoría que ya no existe.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const mes = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[D.MONTHS.length - 1];
    D.TRANSACTIONS.length = 0;

    // Dos gastos con categorías que NO existen (dos ids rotos DISTINTOS, que es lo que el balde
    // junta), y uno con una categoría real, para que el donut tenga más de un segmento.
    D.TRANSACTIONS.push({ id: 'rota1', fecha: mes + '-05', hora: '10:00', comercio: 'Kiosco',
      monto: 12000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'categoria_borrada_vieja', monto: 12000 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.TRANSACTIONS.push({ id: 'rota2', fecha: mes + '-07', hora: '11:00', comercio: 'Feria',
      monto: 8000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'otra_que_ya_no_existe', monto: 8000 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.TRANSACTIONS.push({ id: 'buena', fecha: mes + '-09', hora: '12:00', comercio: 'Jumbo',
      monto: 30000, medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'supermercado', monto: 30000 }], porCobrar: [], reglaAuto: false, nota: '' });
    D.render();
    return mes;
  });

  // Control positivo: las dos categorías rotas caen en UN solo balde, no en dos segmentos.
  const bucket = await page.evaluate(() => ({
    rota1: window.__debug.catBucketId('categoria_borrada_vieja'),
    rota2: window.__debug.catBucketId('otra_que_ya_no_existe'),
    buena: window.__debug.catBucketId('supermercado'),
  }));
  check('(control) los dos ids rotos caen en el mismo balde', bucket.rota1 === bucket.rota2 && bucket.rota1 === '__sin_categoria', bucket);
  check('(control) una categoría real NO cae en ese balde', bucket.buena === 'supermercado', bucket);

  // El filtro es lo que estaba roto: se comprueba directo, sin depender de poder tocar el donut.
  const filtro = await page.evaluate(() => {
    const D = window.__debug;
    return {
      rota: D.categoryFilterMatches('categoria_borrada_vieja', '__sin_categoria'),
      otraRota: D.categoryFilterMatches('otra_que_ya_no_existe', '__sin_categoria'),
      buena: D.categoryFilterMatches('supermercado', '__sin_categoria'),
      normalSigueAndando: D.categoryFilterMatches('supermercado', 'supermercado'),
    };
  });
  check('el filtro "sin categoría" encuentra una categoría borrada', filtro.rota === true, filtro);
  check('el filtro "sin categoría" encuentra cualquier id roto, no uno solo', filtro.otraRota === true, filtro);
  // Sin esto el arreglo sería un filtro que muestra TODO, que es tan inútil como mostrar nada.
  check('el filtro "sin categoría" NO arrastra las categorías que sí existen', filtro.buena === false, filtro);
  check('(control) el filtro normal por categoría sigue funcionando', filtro.normalSigueAndando === true, filtro);

  // Y el recorrido completo: aplicar el filtro y ver que la lista trae las dos rotas.
  await page.evaluate((m) => {
    const D = window.__debug;
    D.state.categoryFilter = '__sin_categoria';
    D.state.categoryFilterMonth = m;
    D.state.tab = 'transacciones';
    D.render();
  }, mes);
  await page.waitForTimeout(250);

  const filas = await page.$$eval('.tx-item[data-tx]', els => els.map(e => e.getAttribute('data-tx')));
  check('la lista filtrada NO queda vacía', filas.length > 0, { filas });
  check('trae las dos transacciones sin categoría', filas.includes('rota1') && filas.includes('rota2'), { filas });
  check('no trae la que sí tiene categoría', !filas.includes('buena'), { filas });

  await browser.close();
  finish(errors);
})();
