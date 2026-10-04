// Elegir a mano cuál de mis transacciones corresponde a una línea de la cartola.
//
// Existe porque el matching difuso no siempre acierta: un comercio que el banco escribe
// distinto, una fecha corrida, un monto que no se parece en nada. La persona sabe cuál es; la
// app solo tiene que dejarla decirlo. Sin esto, esas líneas quedaban en "para revisar a mano"
// sin ninguna acción posible -- un cartel que informaba y nada más.
//
// Dos cosas que el panel de elegir tiene que hacer bien, y que el test vigila:
//  · NO filtrar por monto ni por comercio. Si el matching hubiera acertado no estaríamos acá, así
//    que filtrar por lo mismo que falló dejaría afuera justo la transacción que se busca.
//  · Emparejar sin pisar nada: categoría, nota, origen y cobros a personas quedan intactos.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const setup = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.MONTHS[D.state.monthIndex];
    const f = d => mes + '-' + String(d).padStart(2, '0');
    D.TRANSACTIONS.length = 0;

    // El gasto real, subido a mano: el banco lo escribe "SOC COM ALIM SPA" y acá se anotó con el
    // nombre de verdad del local. Ni el comercio ni el monto se parecen, así que el matching
    // difuso no puede acertar -- es exactamente el caso de elegir a mano.
    D.TRANSACTIONS.push({ id: 'manual-almuerzo', fecha: f(12), hora: '13:30', comercio: 'Almuerzo con la Jose',
      monto: 28000, medio: 'visa', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar',
      categorias: [{ cat: 'restoranes', monto: 28000 }],
      porCobrar: [{ persona: 'Jose', monto: 14000, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }],
      reglaAuto: false, nota: 'cumpleaños', origen: 'manual' });
    // Un ingreso cercano, para comprobar que el panel no ofrece cosas del tipo equivocado.
    D.TRANSACTIONS.push({ id: 'un-ingreso', fecha: f(12), hora: '09:00', comercio: 'Devolución',
      monto: 31500, medio: 'visa', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado',
      categorias: [], porCobrar: [], reglaAuto: false, nota: '', origen: 'manual' });
    // Y un gasto lejano en el tiempo, que tampoco debería ofrecerse. La ventana son 20 días, así
    // que se lo pone bastante más atrás para que el control pruebe algo de verdad.
    const lejana = new Date(f(13) + 'T00:00:00');
    lejana.setDate(lejana.getDate() - 45);
    const fLejana = lejana.toISOString().slice(0, 10);
    D.TRANSACTIONS.push({ id: 'gasto-lejano', fecha: fLejana, hora: '10:00', comercio: 'Viejo',
      monto: 31500, medio: 'visa', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [], porCobrar: [], reglaAuto: false, nota: '', origen: 'manual' });

    // La línea de la cartola: otro nombre, otro monto, un día corrido.
    const movs = [
      { fecha: f(13), detalle: 'SOC COM ALIM SPA', comercioSugerido: 'SOC COM ALIM SPA', monto: -31500, tipoMov: 'gasto' },
    ];
    movs.forEach((m, i) => { m.fuenteLineaId = D.movementLineId(m, i); });

    const R = D.state.reconciliar;
    R.archivo = 'cartola.pdf'; R.tipo = 'tarjeta_nacional'; R.movimientos = movs;
    R.eliminarSeleccionados = []; R.eligiendoParaLinea = null;
    D.state.tab = 'menu'; D.state.menuSection = 'reconciliar';
    D.renderMenuView();

    const diff = D.buildReconcileDiff(movs, 'tarjeta_nacional');
    const cands = D.candidatosParaElegir(movs[0]).map(t => t.id);
    return { linea: movs[0].fuenteLineaId, cands,
      enRevisar: diff.revisar.length, enAgregar: diff.agregar.length, enMergear: diff.mergear.length };
  });
  await page.waitForTimeout(250);

  // ---------- control: el matching difuso efectivamente NO acierta acá ----------
  check('(control) el matching no propone ningún merge para esta línea', setup.enMergear === 0, setup);
  check('(control) la línea se propone como nueva, porque nada le calza', setup.enAgregar === 1, setup);

  // ---------- los candidatos que se ofrecen ----------
  check('ofrece el gasto cercano aunque el monto y el comercio no se parezcan',
    setup.cands.includes('manual-almuerzo'), setup.cands);
  // Lo que no puede estar equivocado sí se filtra: un cargo no puede ser un ingreso.
  check('no ofrece transacciones del tipo equivocado', !setup.cands.includes('un-ingreso'), setup.cands);
  check('no ofrece transacciones lejanas en el tiempo', !setup.cands.includes('gasto-lejano'), setup.cands);

  // ---------- el recorrido por la pantalla ----------
  let txt = await page.textContent('#view-root');
  // Cae en "faltan en la app" justamente porque no calza con nada: es el caso más común de
  // elegir a mano, y por eso el botón tiene que estar también en ese grupo y no solo en "revisar".
  check('(control) la línea cae en "faltan en la app", no en revisar', /Faltan en la app/.test(txt), txt.slice(0, 600));
  check('ofrece elegir a mano', !!(await page.$('[data-elegir-calce-abrir]')));

  await page.click('[data-elegir-calce-abrir]');
  await page.waitForTimeout(200);
  txt = await page.textContent('#view-root');
  check('el panel muestra la transacción buscada', /Almuerzo con la Jose/.test(txt), txt.slice(0, 700));
  check('el panel avisa que no se toca lo que ya escribiste', /sin tocar su categoría/.test(txt), txt.slice(0, 900));
  check('marca cuáles subiste a mano', /a mano/.test(txt), txt.slice(0, 900));

  await page.click('[data-elegir-calce-tx="manual-almuerzo"]');
  await page.waitForTimeout(250);

  const tras = await page.evaluate(() => {
    const t = window.__debug.TRANSACTIONS.find(x => x.id === 'manual-almuerzo');
    return { conciliada: t.conciliada, monto: t.monto, nota: t.nota, origen: t.origen,
      cat: t.categorias[0].cat, fuenteLineaId: t.fuenteLineaId,
      porCobrar: t.porCobrar.map(p => ({ persona: p.persona, monto: p.monto })),
      eligiendo: window.__debug.state.reconciliar.eligiendoParaLinea };
  });
  check('elegir a mano empareja la transacción', tras.conciliada === true, tras);
  check('y guarda la línea, para no volver a proponerla', tras.fuenteLineaId === setup.linea, tras);
  // Elegir a mano NO toca el monto: la cartola dice $31.500 y el gasto sigue en $28.000 hasta
  // que la usuaria lo pida explícitamente. Una decisión por vez.
  check('no cambia el monto por su cuenta', tras.monto === 28000, tras);
  check('conserva categoría, nota y origen',
    tras.cat === 'restoranes' && tras.nota === 'cumpleaños' && tras.origen === 'manual', tras);
  check('conserva el cobro a Jose intacto',
    tras.porCobrar.length === 1 && tras.porCobrar[0].monto === 14000, tras.porCobrar);
  check('el panel se cierra al elegir', tras.eligiendo === null, tras);

  txt = await page.textContent('#view-root');
  check('la línea ya no se propone como nueva', !/Faltan en la app/.test(txt), txt.slice(0, 500));

  await browser.close();
  finish(errors);
})();
