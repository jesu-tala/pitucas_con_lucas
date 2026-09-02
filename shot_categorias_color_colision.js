// jesu reportó que si dos categorías del mismo tipo (ej. "Sueldo A" e "Sueldo B", ambas
// ingreso) quedan con el mismo color, en los gráficos de torta se ven como un solo bloque
// continuo -- no hay forma de distinguirlas a simple vista. Este test fija dos arreglos:
// 1) el editor de categorías ahora avisa, en el momento de elegir el color, si otra categoría
//    del mismo tipo ya lo está usando (categoriasConColor) -- así se evita crear el problema.
// 2) el espacio entre segmentos vecinos del donut se ensanchó de 3° a 6° (buildDonut), para que
//    dos segmentos que igual terminen con el mismo color al menos se vean como dos bloques
//    separados, no uno solo.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- 1) categoriasConColor detecta colisiones reales de los datos de ejemplo ----------
  const colision = await page.evaluate(() => {
    const D = window.__debug;
    return {
      // restoranes y compras vienen ambas como gasto/peach en los datos de ejemplo.
      peachGasto: D.categoriasConColor('gasto', 'peach', null),
      // ninguna categoría de INGRESO usa 'pink' en los datos de ejemplo -- no debería haber colisión.
      pinkIngreso: D.categoriasConColor('ingreso', 'pink', null),
      // al editar la propia categoría, no debe "colisionar consigo misma".
      excluyeAsiMisma: D.categoriasConColor('gasto', 'peach', 'restoranes'),
    };
  });
  check('categoriasConColor() detecta que "restoranes" y "compras" (ambas gasto) comparten el color peach', colision.peachGasto.includes('Restoranes y bares') && colision.peachGasto.includes('Compras'), colision.peachGasto);
  check('Un color sin ninguna categoría de ese tipo no marca colisión', colision.pinkIngreso.length === 0, colision.pinkIngreso);
  check('Al excluir la propia categoría (editándola), no aparece ella misma en la lista', !colision.excluyeAsiMisma.includes('Restoranes y bares'), colision.excluyeAsiMisma);

  // ---------- 1b) el editor de categorías muestra el aviso en pantalla ----------
  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="categorias"]');
  await page.waitForTimeout(150);
  // Crear una categoría nueva, cambiarla a tipo "ingreso" (sueldo=mint, pololos_extra=sky en
  // los datos de ejemplo -- todos los demás colores están libres para ingreso) y elegir "mint"
  // -- debería aparecer el aviso.
  const tieneBotonNueva = await page.evaluate(() => !!document.querySelector('[data-add-cat]'));
  if (tieneBotonNueva) {
    await page.click('[data-add-cat]');
    await page.waitForTimeout(150);
    await page.click('[data-seg="cat-draft-tipo"] [data-seg-val="ingreso"]');
    await page.waitForTimeout(150);
    await page.click('[data-cat-draft-color="mint"]');
    await page.waitForTimeout(150);
    const avisoTexto = await page.evaluate(() => document.getElementById('view-root').textContent);
    check('El editor de categorías avisa si el color elegido ya lo usa otra categoría del mismo tipo', /ya lo usa/i.test(avisoTexto) && /Sueldo/.test(avisoTexto), avisoTexto.slice(0, 400));
    await page.click('[data-cat-draft-color="peach"]');
    await page.waitForTimeout(150);
    const sinAvisoTexto = await page.evaluate(() => document.getElementById('view-root').textContent);
    check('...y el aviso desaparece al elegir un color sin colisión', !/ya lo usa/i.test(sinAvisoTexto), sinAvisoTexto.slice(0, 400));
  } else {
    check('El editor de categorías avisa si el color elegido ya lo usa otra categoría del mismo tipo', false, 'no se encontró el botón para crear una categoría nueva ([data-cat-new])');
  }

  // ---------- 2) el gap entre segmentos del donut es de 6°, no 3° ----------
  const donut = await page.evaluate(() => {
    const D = window.__debug;
    const size = 172, strokeW = 20;
    const svg = D.buildDonut([
      { value: 50, color: 'red', id: 'a' },
      { value: 50, color: 'blue', id: 'b' },
    ], size, strokeW);
    const matches = [...svg.matchAll(/d="M ([\d.]+) ([\d.]+) A ([\d.]+) [\d.]+ 0 (\d) 1 ([\d.]+) ([\d.]+)"/g)];
    return {
      count: matches.length,
      seg1End: matches[0] ? { x: +matches[0][5], y: +matches[0][6] } : null,
      seg2Start: matches[1] ? { x: +matches[1][1], y: +matches[1][2] } : null,
      size, strokeW,
    };
  });
  check('buildDonut() con 2 segmentos genera 2 arcos separados', donut.count === 2, donut);
  if (donut.count === 2) {
    // Mismo cálculo que adentro de buildDonut: r = size/2 - strokeW/2 - 2, centro en (size/2,size/2).
    const cx = donut.size / 2, cy = donut.size / 2;
    const r = donut.size / 2 - donut.strokeW / 2 - 2;
    const polar = (angleDeg) => ({
      x: cx + r * Math.cos(angleDeg * Math.PI / 180),
      y: cy + r * Math.sin(angleDeg * Math.PI / 180),
    });
    // Con 2 segmentos de 50/50 partiendo en -90°: el primero barre 180-6=174° (termina en 84°),
    // el segundo arranca en -90+180=90° -- un gap de exactamente 6°.
    const finEsperado = polar(84);
    const inicioEsperado = polar(90);
    const cerca = (a, b) => Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05;
    check('El primer segmento termina justo donde debería con un gap de 6° (no 3°)', cerca(donut.seg1End, finEsperado), { obtenido: donut.seg1End, esperado: finEsperado });
    check('El segundo segmento empieza justo donde debería con un gap de 6° (no 3°)', cerca(donut.seg2Start, inicioEsperado), { obtenido: donut.seg2Start, esperado: inicioEsperado });
  }

  await finish({ context, browser, errors });
})();
