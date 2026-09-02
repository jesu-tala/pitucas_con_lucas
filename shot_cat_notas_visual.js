const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 420, height: 1500 } });

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // t2 = Copec Providencia, categoría única (Transporte)
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('.sheet-scroll').scrollTo(0, 600));
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/cat_notas_1.png' });

  // Escribir una nota
  await page.fill('[data-tx-field="nota"]', 'Bencina antes del viaje a la playa');
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/cat_notas_2.png' });

  // Agregar una segunda categoría para ver el split con dots + $/%
  await page.click('[data-add-catrow="t2"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/cat_notas_3.png' });

  // Nota: el diseño de esta fila cambió de un simple punto de color (.cat-dot) a un avatar con
  // el ícono/emoji real de la categoría (.cat-row-icon) — la usuaria pidió volver a ver esos
  // emojis, así que este check ahora bloquea ESE diseño en vez del punto plano viejo.
  const check1 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.cat-rows .split-row'));
    const icons = rows.map(r => !!r.querySelector('.cat-row-icon'));
    const tx = window.__debug.TX.find(t => t.id === 't2');
    return { nRows: rows.length, icons, nota: tx.nota, categorias: tx.categorias };
  });
  console.log('Filas de categoría con avatar de ícono:', JSON.stringify(check1));

  check('La nota escrita se guardó en tx.nota', check1.nota === 'Bencina antes del viaje a la playa', check1.nota);
  check('Aparece una segunda fila de categoría tras "Agregar categoría"', check1.nRows === 2, check1.nRows);
  check('Cada fila de categoría tiene su avatar de ícono (.cat-row-icon)', check1.icons.length > 0 && check1.icons.every(Boolean), check1.icons);

  await finish({ context, browser, errors });
})();
