// jesu reported that if two categories of the same type (e.g. "Sueldo A" and "Sueldo B", both
// ingreso) end up with the same color, they look like a single continuous block in the pie
// charts -- there's no way to tell them apart at a glance. Since "colores únicos" (each category
// gets its own algorithmically-assigned hue, categoryHue.ts) this can basically only happen via
// a manual override now, so this test locks in:
// 1) the category editor still warns, at the moment of dragging the hue slider, if the chosen
//    hue lands too close to another category of the same type (categoriesCollidingWithHue).
// 2) the gap between neighboring donut segments stays 6° (not 3°), so that two segments that do
//    end up with a close color at least look like two separate blocks, not one.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- 1) categoriesCollidingWithHue detects real collisions ----------
  const colision = await page.evaluate(() => {
    const D = window.__debug;
    const cats = D.CATEGORIES;
    return {
      // supermercado (gasto) sits at hue 0 in the sample data -- a hue 15° away is within the
      // minimum gap and should collide with it.
      cercaDeSupermercado: D.categoriesCollidingWithHue(cats, 'gasto', 15, null),
      // 100° is far from both sueldo (0) and pololos_extra (180) -- no collision.
      lejosDeIngresos: D.categoriesCollidingWithHue(cats, 'ingreso', 100, null),
      // when editing the category itself, it shouldn't "collide with itself".
      excluyeAsiMisma: D.categoriesCollidingWithHue(cats, 'gasto', 0, 'supermercado'),
    };
  });
  check('categoriesCollidingWithHue() detecta un tono muy cercano al de "Supermercado" (gasto)', colision.cercaDeSupermercado.includes('Supermercado'), colision.cercaDeSupermercado);
  check('Un tono lejos de toda categoría de ese tipo no marca colisión', colision.lejosDeIngresos.length === 0, colision.lejosDeIngresos);
  check('Al excluir la propia categoría (editándola), no aparece ella misma en la lista', !colision.excluyeAsiMisma.includes('Supermercado'), colision.excluyeAsiMisma);

  // ---------- 1b) the category editor shows the warning on screen ----------
  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  await page.click('[data-menu-open="categorias"]');
  await page.waitForTimeout(150);
  const tieneBotonNueva = await page.evaluate(() => !!document.querySelector('[data-add-cat]'));
  if (tieneBotonNueva) {
    await page.click('[data-add-cat]');
    await page.waitForTimeout(150);
    await page.click('[data-seg="cat-draft-tipo"] [data-seg-val="ingreso"]');
    await page.waitForTimeout(150);
    // Drag the hue slider to 5° -- right next to "Sueldo" (hue 0 in the sample data).
    await page.evaluate(() => {
      window.__debug.state.catDraft.colorHue = 5;
      window.__debug.state.catDraft.colorHueTouched = true;
      window.__debug.render();
    });
    await page.waitForTimeout(150);
    const avisoTexto = await page.evaluate(() => document.getElementById('view-root').textContent);
    check('El editor de categorías avisa si el tono elegido queda muy cerca del de otra categoría del mismo tipo', /muy parecido/i.test(avisoTexto) && /Sueldo/.test(avisoTexto), avisoTexto.slice(0, 400));
    await page.evaluate(() => {
      window.__debug.state.catDraft.colorHue = 100;
      window.__debug.render();
    });
    await page.waitForTimeout(150);
    const sinAvisoTexto = await page.evaluate(() => document.getElementById('view-root').textContent);
    check('...y el aviso desaparece al elegir un tono sin colisión', !/muy parecido/i.test(sinAvisoTexto), sinAvisoTexto.slice(0, 400));
  } else {
    check('El editor de categorías avisa si el tono elegido ya lo usa otra categoría del mismo tipo', false, 'no se encontró el botón para crear una categoría nueva ([data-cat-new])');
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
