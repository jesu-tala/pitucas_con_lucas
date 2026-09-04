const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 420, height: 1500 } });

  await page.evaluate(() => { window.__debug.state.tab = 'transacciones'; window.__debug.render(); });
  await page.waitForTimeout(150);

  // t2 = Copec Providencia, single category (Transporte)
  await page.click('[data-tx="t2"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('.sheet-scroll').scrollTo(0, 600));
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/cat_notas_1.png' });

  // Write a note
  await page.fill('[data-tx-field="nota"]', 'Bencina antes del viaje a la playa');
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/cat_notas_2.png' });

  // Add a second category to see the split with dots + $/%
  await page.click('[data-add-cat-row="t2"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/cat_notas_3.png' });

  // Note: this row's design changed from a plain color dot (.cat-dot) to an avatar with
  // the category's real icon/emoji (.cat-row-icon) — the user asked to see those
  // emojis again, so this check now locks in THAT design instead of the old flat dot.
  const check1 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.cat-rows .split-row'));
    const icons = rows.map(r => !!r.querySelector('.cat-row-icon'));
    const tx = window.__debug.TRANSACTIONS.find(t => t.id === 't2');
    return { nRows: rows.length, icons, nota: tx.nota, categorias: tx.categorias };
  });
  console.log('Filas de categoría con avatar de ícono:', JSON.stringify(check1));

  check('La nota escrita se guardó en tx.nota', check1.nota === 'Bencina antes del viaje a la playa', check1.nota);
  check('Aparece una segunda fila de categoría tras "Agregar categoría"', check1.nRows === 2, check1.nRows);
  check('Cada fila de categoría tiene su avatar de ícono (.cat-row-icon)', check1.icons.length > 0 && check1.icons.every(Boolean), check1.icons);

  await finish({ context, browser, errors });
})();
