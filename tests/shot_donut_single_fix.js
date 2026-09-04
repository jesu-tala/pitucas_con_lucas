const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 420, height: 1400 } });

  // Before: with a single segment (100%, e.g. a single contribution to a platform this month),
  // buildDonut generated an SVG arc whose start and end points coincide — it renders as a
  // point instead of a full ring. We force that exact scenario: a single month with a
  // single investment contribution (to Fintual), like in the screenshot the user sent.
  const info = await page.evaluate(() => {
    const d = window.__debug;
    d.state.tab = 'resumen';
    d.state.summarySub = 'balance';
    const mesActual = d.MONTHS[d.state.monthIndex]; // the month Balance shows by default
    // Remove any other investment transaction from this month, leaving only one — mutating
    // the same array (splice), not reassigning d.TRANSACTIONS = ... (that would only change the reference
    // exposed on the debug object, not the internal array that render()/monthTotals() depend on).
    for(let i=d.TRANSACTIONS.length-1; i>=0; i--){
      if(d.TRANSACTIONS[i].tipo==='inversion' && d.TRANSACTIONS[i].fecha.slice(0,7)===mesActual) d.TRANSACTIONS.splice(i,1);
    }
    d.TRANSACTIONS.push({id:'t_donut_single', fecha: mesActual + '-05', hora:'10:00', comercio:'Aporte Fintual',
      monto: 5000, medio:'cuenta_vista', tipo:'inversion', recurrencia:'variable', estado:'confirmado',
      categorias:[{cat:'fintual', monto:5000}], porCobrar:[], reglaAuto:false, nota:''});
    d.state.tab = 'resumen';
    d.state.summarySub = 'balance';
    d.render();
    return { mesActual };
  });
  await page.waitForTimeout(200);

  const svgCheck = await page.evaluate(() => {
    const titles = Array.from(document.querySelectorAll('.donut-card-title'));
    const card = titles.find(el => el.textContent.includes('Inversiones por categoría'));
    if (!card) return { found: false };
    const wrap = card.closest('.donut-card').querySelector('.donut-svg-wrap svg');
    return {
      found: true,
      hasCircle: !!wrap.querySelector('circle'),
      nPaths: wrap.querySelectorAll('path').length,
      html: wrap.outerHTML.slice(0, 300),
    };
  });
  console.log('With a single contribution this month, the donut draws a full <circle> (not a degenerate point):', JSON.stringify(svgCheck));
  check('El donut dibuja un <circle> completo (no un punto degenerado)', svgCheck.found && svgCheck.hasCircle && svgCheck.nPaths === 0, svgCheck);

  await finish({ context, browser, errors });
})();
