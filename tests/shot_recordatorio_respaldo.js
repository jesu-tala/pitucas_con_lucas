// Hallazgo MEDIO de la auditoría: el respaldo JSON existe, pero es manual y nadie lo recuerda --
// y ya se vio lo caro que sale. Un bug del modo demo dejó una cuenta real con las categorías y los
// medios de pago vacíos, y sin una copia previa no hubo forma de devolver los nombres que la
// persona había puesto: hubo que reconstruirlos a mano desde las transacciones.
//
// Ahora la fecha del último respaldo se guarda en el blob (viaja entre dispositivos) y el menú
// avisa cuando pasó demasiado tiempo o nunca se hizo uno. Este test fija las dos mitades que
// importan: que avise cuando corresponde, y que NO moleste cuando no corresponde -- un
// recordatorio que aparece siempre termina ignorándose, que es justo lo que no sirve.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    window.conTx = function (D, n) {
      D.TRANSACTIONS.length = 0;
      for (let i = 0; i < n; i++) {
        D.TRANSACTIONS.push({ id: 't' + i, fecha: D.todayISO(), hora: '10:00', comercio: 'Algo', monto: 1000,
          medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
          categorias: [], porCobrar: [], reglaAuto: false, nota: '' });
      }
    };
    window.haceDias = function (D, n) {
      const d = new Date(D.todayISO() + 'T12:00:00');
      d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    };
    window.abrirMenu = function (D) { D.state.tab = 'menu'; D.state.menuSection = null; D.render(); };
  });

  // ---------- 1) Cuenta nueva, sin transacciones: NO molestar ----------
  const vacia = await page.evaluate(() => {
    const D = window.__debug;
    window.conTx(D, 0);
    D.ultimoRespaldo = null;
    window.abrirMenu(D);
    return { info: D.respaldoInfo(), alertasEnPantalla: document.querySelectorAll('.menu-item-sub-alerta').length };
  });
  check('1) sin transacciones todavía, no avisa nada (no hay nada que perder)', vacia.info.vencido === false && vacia.alertasEnPantalla === 0, vacia);

  // ---------- 2) Con datos y sin ningún respaldo: avisa ----------
  const nunca = await page.evaluate(() => {
    const D = window.__debug;
    window.conTx(D, 5);
    D.ultimoRespaldo = null;
    window.abrirMenu(D);
    const item = Array.from(document.querySelectorAll('.menu-list-item')).find(b => /Respaldo en JSON/.test(b.textContent));
    return {
      info: D.respaldoInfo(),
      texto: item ? item.textContent : null,
      resaltado: !!(item && item.querySelector('.menu-item-sub-alerta'))
    };
  });
  check('2) con datos y sin ningún respaldo, avisa en el menú', nunca.info.vencido === true && nunca.resaltado === true, nunca);
  check('   y lo dice explícito, no con un texto genérico', /Nunca descargaste uno/.test(nunca.texto || ''), nunca.texto);

  // ---------- 3) Respaldo reciente: NO molestar ----------
  const reciente = await page.evaluate(() => {
    const D = window.__debug;
    window.conTx(D, 5);
    D.ultimoRespaldo = window.haceDias(D, 3);
    window.abrirMenu(D);
    const item = Array.from(document.querySelectorAll('.menu-list-item')).find(b => /Respaldo en JSON/.test(b.textContent));
    return { info: D.respaldoInfo(), texto: item ? item.textContent : null, resaltado: !!(item && item.querySelector('.menu-item-sub-alerta')) };
  });
  check('3) con un respaldo de hace 3 días, no avisa', reciente.info.vencido === false && reciente.resaltado === false, reciente);
  check('   pero igual muestra hace cuánto fue', /hace 3 días/.test(reciente.texto || ''), reciente.texto);

  // ---------- 4) Respaldo viejo: vuelve a avisar ----------
  const viejo = await page.evaluate(() => {
    const D = window.__debug;
    window.conTx(D, 5);
    D.ultimoRespaldo = window.haceDias(D, D.DIAS_PARA_RECORDAR_RESPALDO + 5);
    window.abrirMenu(D);
    const item = Array.from(document.querySelectorAll('.menu-list-item')).find(b => /Respaldo en JSON/.test(b.textContent));
    // Y dentro de la pantalla de Respaldo, la explicación de por qué importa.
    D.state.menuSection = 'respaldo'; D.render();
    return {
      info: D.respaldoInfo(),
      resaltado: !!(item && item.querySelector('.menu-item-sub-alerta')),
      explica: /única copia fuera de la app/.test(document.getElementById('view-root').textContent)
    };
  });
  check('4) con un respaldo vencido, vuelve a avisar en el menú', viejo.info.vencido === true && viejo.resaltado === true, viejo);
  check('   y la pantalla de Respaldo explica por qué importa', viejo.explica === true, viejo);

  // ---------- 5) Descargar uno apaga el aviso y queda guardado en el blob ----------
  const trasDescargar = await page.evaluate(() => {
    const D = window.__debug;
    window.conTx(D, 5);
    D.ultimoRespaldo = window.haceDias(D, 90);
    D.state.tab = 'menu'; D.state.menuSection = 'respaldo'; D.render();
    document.querySelector('[data-export-json]').click();
    return {
      guardado: D.buildFullStateBlob().ultimoRespaldo,
      hoy: D.todayISO(),
      vencidoAhora: D.respaldoInfo().vencido
    };
  });
  check('5) descargar un respaldo lo registra con la fecha de hoy', trasDescargar.guardado === trasDescargar.hoy, trasDescargar);
  check('   queda dentro del blob que se guarda (no se pierde al recargar ni entre dispositivos)', trasDescargar.guardado !== null && trasDescargar.guardado !== undefined, trasDescargar);
  check('   y el aviso se apaga', trasDescargar.vencidoAhora === false, trasDescargar);

  await finish({ context, browser, errors });
})();
