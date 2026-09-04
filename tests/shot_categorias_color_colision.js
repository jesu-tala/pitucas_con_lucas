// jesu reported that if two categories of the same type (e.g. "Sueldo A" and "Sueldo B", both
// ingreso) end up with the same color, they look like a single continuous block in the pie
// charts -- there's no way to tell them apart at a glance. This test locks in two fixes:
// 1) the category editor now warns, at the moment of picking the color, if another category
//    of the same type is already using it (categoriesWithColor) -- preventing the problem in the first place.
// 2) the gap between neighboring donut segments widened from 3° to 6° (buildDonut), so that
//    two segments that do end up with the same color at least look like two separate
//    blocks, not one.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- 1) categoriesWithColor detects real collisions in the sample data ----------
  const colision = await page.evaluate(() => {
    const D = window.__debug;
    return {
      // restoranes and compras both come as gasto/peach in the sample data.
      peachGasto: D.categoriesWithColor('gasto', 'peach', null),
      // no INGRESO category uses 'pink' in the sample data -- there shouldn't be a collision.
      pinkIngreso: D.categoriesWithColor('ingreso', 'pink', null),
      // when editing the category itself, it shouldn't "collide with itself".
      excluyeAsiMisma: D.categoriesWithColor('gasto', 'peach', 'restoranes'),
    };
  });
  check('categoriesWithColor() detecta que "restoranes" y "compras" (ambas gasto) comparten el color peach', colision.peachGasto.includes('Restoranes y bares') && colision.peachGasto.includes('Compras'), colision.peachGasto);
  check('Un color sin ninguna categoría de ese tipo no marca colisión', colision.pinkIngreso.length === 0, colision.pinkIngreso);
  check('Al excluir la propia categoría (editándola), no aparece ella misma en la lista', !colision.excluyeAsiMisma.includes('Restoranes y bares'), colision.excluyeAsiMisma);

  // ---------- 1b) the category editor shows the warning on screen ----------
  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="categorias"]');
  await page.waitForTimeout(150);
  // Create a new category, switch it to type "ingreso" (sueldo=mint, pololos_extra=sky in
  // the sample data -- every other color is free for ingreso) and pick "mint"
  // -- the warning should appear.
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

  // ---------- 2) the gap between donut segments is 6°, not 3° ----------
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
    // Same calculation as inside buildDonut: r = size/2 - strokeW/2 - 2, center at (size/2,size/2).
    const cx = donut.size / 2, cy = donut.size / 2;
    const r = donut.size / 2 - donut.strokeW / 2 - 2;
    const polar = (angleDeg) => ({
      x: cx + r * Math.cos(angleDeg * Math.PI / 180),
      y: cy + r * Math.sin(angleDeg * Math.PI / 180),
    });
    // With 2 segments of 50/50 starting at -90°: the first sweeps 180-6=174° (ends at 84°),
    // the second starts at -90+180=90° -- a gap of exactly 6°.
    const finEsperado = polar(84);
    const inicioEsperado = polar(90);
    const cerca = (a, b) => Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05;
    check('El primer segmento termina justo donde debería con un gap de 6° (no 3°)', cerca(donut.seg1End, finEsperado), { obtenido: donut.seg1End, esperado: finEsperado });
    check('El segundo segmento empieza justo donde debería con un gap de 6° (no 3°)', cerca(donut.seg2Start, inicioEsperado), { obtenido: donut.seg2Start, esperado: inicioEsperado });
  }

  await finish({ context, browser, errors });
})();
