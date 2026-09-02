const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const result = await page.evaluate(() => {
    const D = window.__debug;
    const bch = D.PLATAFORMA_DATA.banco_chile.valorHistorial;
    const metas = D.METAS_INVERSION.filter(m=>m.plataformaId==='banco_chile');
    const months = Object.keys(bch);
    const out = {};
    months.forEach(m=>{
      const sumMetas = metas.reduce((s,meta)=> s + (meta.historial[m]||0), 0);
      out[m] = { platformValue: bch[m], sumOfMetas: sumMetas, match: bch[m]===sumMetas };
    });
    return out;
  });
  console.log(JSON.stringify(result, null, 1));

  check('valorHistorial de banco_chile coincide con la suma de metas en cada mes', Object.values(result).every(r => r.match), result);

  await finish({ context, browser, errors });
})();
