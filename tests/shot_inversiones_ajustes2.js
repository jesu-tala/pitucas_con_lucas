// Segunda ronda de ajustes a Inversiones que pidió la usuaria después del rediseño:
// (2) los cuadrados de "Aportado neto"/"Ganancia-pérdida aprox." más chicos/discretos.
// (3) el objetivo de inversión TOTAL (mes a mes) también genera racha, igual que las metas
//     por plataforma.
// (4) dentro de una meta, la fila de "Comisión anual" separada de la barra de progreso y
//     más chica/discreta; y los cuadraditos de mes se extienden hasta diciembre (no solo
//     hasta el último mes con dato real).
// (5) el simulador ya no es verde y su texto es bastante más breve.
// (6)+(7) el % de inversión de Balance sale de la suma de "aporte mensual meta" de TODAS las
//     metas (todas las plataformas), y en Inversiones se ve ese mismo monto mensual chiquito.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-resumen-sub="inversiones"]');
  await page.waitForTimeout(200);

  // ---------- (2) Cuadrados de totales más chicos ----------
  const totalTiles = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.platform-total-label')].find(el => el.textContent.includes('Total invertido'));
    const grid = label ? label.closest('.card').querySelector('.stat-grid') : null;
    if (!grid) return null;
    const tile = grid.querySelector('.stat-tile');
    const cs = tile ? getComputedStyle(tile) : null;
    return {
      esCompacto: grid.classList.contains('stat-grid-compact'),
      paddingTop: cs ? parseFloat(cs.paddingTop) : null,
    };
  });
  check('(2) La card de totales usa el modificador .stat-grid-compact', totalTiles && totalTiles.esCompacto === true, totalTiles);
  check('(2) El padding de esos cuadrados es más chico que el de Balance (14px)', totalTiles && totalTiles.paddingTop < 12, totalTiles);

  // ---------- (3) Racha del objetivo total ----------
  // Deja los últimos 3 meses (incluido el actual) marcados como cumplidos, para forzar una
  // racha de 3 -- mismo criterio que metaRacha para una meta puntual.
  const rachaInfo = await page.evaluate(() => {
    const D = window.__debug;
    const year = D.todayISO().slice(0, 4);
    const mesActual = D.todayISO().slice(0, 7);
    const months = D.fullYearMonths(year).filter(m => m <= mesActual);
    months.forEach(m => { D.METAS_TOTAL_CHECKS[m] = false; });
    const last3 = months.slice(-3);
    last3.forEach(m => { D.METAS_TOTAL_CHECKS[m] = true; });
    D.render();
    return { calculada: D.metaTotalRacha() };
  });
  check('(3 setup) metaTotalRacha() calcula 3 tras marcar los últimos 3 meses', rachaInfo.calculada === 3, rachaInfo);
  await page.waitForTimeout(150);
  const rachaUi = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.meta-total-checks-label')][0];
    const badge = label ? label.querySelector('.meta-racha-badge') : null;
    const rachaTexto = document.querySelector('.meta-racha')?.textContent || '';
    return { badgeTexto: badge ? badge.textContent : null, rachaTexto };
  });
  check('(3) Aparece el badge de racha (3 🔥) junto al objetivo total', rachaUi.badgeTexto && rachaUi.badgeTexto.includes('3'), rachaUi);
  check('(3) El texto de abajo dice "Racha activa" con el objetivo total', rachaUi.rachaTexto.includes('Racha activa') && rachaUi.rachaTexto.includes('objetivo total'), rachaUi);

  // ---------- (4) Dentro de una meta: comisión + cuadraditos hasta fin de año ----------
  // Abre la plataforma Banco de Chile (banco_chile), que tiene 2 metas con comisión definida
  // en null -- le ponemos comisión a "Fondo de emergencia" (m1) para poder ver su fila.
  await page.evaluate(() => {
    const D = window.__debug;
    const m1 = D.METAS_INVERSION.find(m => m.id === 'm1');
    m1.comision = 1.2;
    D.render();
  });
  await page.click('[data-toggle-platform="banco_chile"]');
  await page.waitForTimeout(200);
  const metaCard = await page.evaluate(() => {
    const nameEl = [...document.querySelectorAll('.meta-goal-name')].find(el => el.textContent.includes('Fondo de emergencia'));
    const card = nameEl ? nameEl.closest('.meta-goal-card') : null;
    if (!card) return null;
    const track = card.querySelector('.budget-track');
    const comisionRow = card.querySelector('.platform-comision-row');
    const cs = comisionRow ? getComputedStyle(comisionRow) : null;
    const chips = [...card.querySelectorAll('.meta-check-chip')].map(c => c.querySelector('.mcc-label')?.textContent);
    return {
      tieneComision: !!comisionRow,
      marginTop: cs ? parseFloat(cs.marginTop) : null,
      fontSize: cs ? parseFloat(cs.fontSize) : null,
      chips,
    };
  });
  check('(4a) La fila de comisión anual tiene separación con la barra de progreso (margin-top >= 8px)', metaCard && metaCard.marginTop >= 8, metaCard);
  check('(4a) Y se ve chica (font-size <= 11px)', metaCard && metaCard.fontSize <= 11, metaCard);
  // m1 (Fondo de emergencia) tiene historial de abril a agosto 2026 -- los cuadraditos deberían
  // llegar hasta diciembre (9 meses: Abr..Dic), no solo hasta Ago (5 meses).
  check('(4b) Los cuadraditos de mes llegan hasta diciembre (9 meses: abr-dic), no solo hasta el último dato', metaCard && metaCard.chips.length === 9 && metaCard.chips[metaCard.chips.length - 1] === 'Dic', metaCard);
  check('   incluye un mes futuro sin dato real (Sep) como cuadradito no marcado', metaCard && metaCard.chips.includes('Sep'), metaCard);

  // ---------- (5) Simulador: sin verde, texto breve ----------
  const simulador = await page.evaluate(() => {
    const card = document.querySelector('.proyeccion-card');
    const cs = card ? getComputedStyle(card) : null;
    const texto = document.querySelector('.proyeccion-text')?.textContent || '';
    const caption = document.querySelector('.proyeccion-caption')?.textContent || '';
    return {
      bg: cs ? cs.backgroundColor : null,
      largoTexto: texto.length,
      largoCaption: caption.length,
      mencionaSupuesto: (texto + ' ' + caption).includes('supuesto moderado'),
    };
  });
  // El verde "sage" del tema (claro) es rgb(199, 217, 183) -- confirmamos que ya no es ese tono.
  check('(5) El fondo del simulador ya no es el verde sage de antes', simulador.bg !== 'rgb(199, 217, 183)', simulador);
  check('(5) El texto principal quedó breve (<140 caracteres, antes >220)', simulador.largoTexto < 140, simulador);
  check('(5) Ya no menciona el párrafo largo sobre el "supuesto moderado"', simulador.mencionaSupuesto === false, simulador);

  // ---------- (6)+(7) % de inversión = suma de metas de TODAS las plataformas ----------
  const metaCheck = await page.evaluate(() => {
    const D = window.__debug;
    const sumaAportes = D.METAS_INVERSION.reduce((s, m) => s + (m.aporteMensualMeta || 0), 0);
    const esperado = { suma: sumaAportes, mensualCLP: D.metaInversionMensualCLP(), pct: D.metaInversionPct() };
    return esperado;
  });
  check('(6/7 setup) metaInversionMensualCLP() = suma de aporteMensualMeta de TODAS las metas', metaCheck.mensualCLP === metaCheck.suma, metaCheck);

  // (7) En Inversiones, la card de "Objetivo de inversión" muestra ese mismo monto mensual.
  const objetivoLine = await page.evaluate(() => document.body.textContent.match(/Aporte mensual objetivo: \$[\d.,]+ · \d+% de tus ingresos/)?.[0] || null);
  check('(7) Se ve "Aporte mensual objetivo" con el monto y % en Inversiones', !!objetivoLine, objetivoLine);

  // (6) En Balance, la meta de Inversión (el %) es ese mismo cálculo -- se lee del texto fijo
  // que dice "tu meta de Inversión (X%) sale sola de lo que ya definiste en Inversiones".
  await page.click('[data-resumen-sub="balance"]');
  await page.waitForTimeout(200);
  const balancePct = await page.evaluate(() => {
    const caption = [...document.querySelectorAll('.meta-caption')].map(el => el.textContent).find(t => t.includes('meta de Inversión'));
    const m = caption ? caption.match(/meta de Inversión \((\d+)%\)/) : null;
    return m ? parseInt(m[1], 10) : null;
  });
  check('(6) El % de meta de Inversión en Balance coincide con la suma de metas de todas las plataformas', balancePct === Math.round(metaCheck.pct), { balancePct, esperado: Math.round(metaCheck.pct) });

  await finish({ context, browser, errors });
})();
