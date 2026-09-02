const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 420, height: 1400 } });

  // Antes: con un solo segmento (100%, ej. un solo aporte a una plataforma este mes),
  // buildDonut generaba un arco SVG cuyo punto de inicio y fin coinciden — se pinta como un
  // punto en vez de un anillo completo. Forzamos ese escenario exacto: un solo mes con un
  // solo aporte de inversión (a Fintual), como en la captura que mandó la usuaria.
  const info = await page.evaluate(() => {
    const d = window.__debug;
    d.state.tab = 'resumen';
    d.state.resumenSub = 'balance';
    const mesActual = d.MONTHS[d.state.monthIndex]; // el mes que Balance muestra por defecto
    // Sacamos cualquier otra transacción de inversión de este mes, dejamos solo una — mutando
    // el mismo array (splice), no reasignando d.TX = ... (eso solo cambiaría la referencia
    // expuesta en el objeto de debug, no el arreglo interno del que dependen render()/monthTotals()).
    for(let i=d.TX.length-1; i>=0; i--){
      if(d.TX[i].tipo==='inversion' && d.TX[i].fecha.slice(0,7)===mesActual) d.TX.splice(i,1);
    }
    d.TX.push({id:'t_donut_single', fecha: mesActual + '-05', hora:'10:00', comercio:'Aporte Fintual',
      monto: 5000, medio:'cuenta_vista', tipo:'inversion', recurrencia:'variable', estado:'confirmado',
      categorias:[{cat:'fintual', monto:5000}], porCobrar:[], reglaAuto:false, nota:''});
    d.state.tab = 'resumen';
    d.state.resumenSub = 'balance';
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
  console.log('Con un solo aporte este mes, el donut dibuja un <circle> completo (no un punto degenerado):', JSON.stringify(svgCheck));
  check('El donut dibuja un <circle> completo (no un punto degenerado)', svgCheck.found && svgCheck.hasCircle && svgCheck.nPaths === 0, svgCheck);

  await finish({ context, browser, errors });
})();
