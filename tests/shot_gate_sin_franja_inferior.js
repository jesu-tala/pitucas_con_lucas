// Bug reportado con foto: en la pantalla de carga (el gate de auth, "Cargando…") se veía una
// franja más clara pegada al borde inferior del iPhone, del alto de la barra de tabs.
//
// La causa no era la barra: era la red de seguridad de plata-clara.html. En móvil el fondo del
// body se pone a --surface A PROPÓSITO, el mismo color de .tabbar, para que si .phone alguna vez
// queda corto del borde real (safe-area del home indicator, una medición de iOS que llega tarde)
// lo que asome por detrás sea del color de la barra y no se note.
//
// Ese razonamiento vale SOLO cuando la barra está en pantalla. En el gate no hay barra: el gate
// es --bg (#19171C en oscuro) y lo que asomaba por detrás era --surface (#221F27), notoriamente
// más claro. La misma red de seguridad que hace invisible el hueco en la app lo volvía visible
// justo en la primera pantalla que se ve al abrir.
//
// El test fuerza la condición exacta del bug (.phone más corto que el viewport real, que es lo
// que pasa en el iPhone y no en un Chromium de escritorio, donde el safe-area vale 0) y exige que
// lo que asome por detrás del gate NO sea de otro color que el gate.
const { openApp, check, finish } = require('./lib/test_kit');

function rgb(s) {
  const m = String(s).match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
}
// Distancia perceptible entre dos colores. La franja del bug era #19171C vs #221F27: una
// diferencia chica en números pero claramente visible como banda en una pantalla oscura.
function distancia(a, b) {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return -1;
  return Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b);
}

(async () => {
  const { context, browser, page, errors } = await openApp({
    hideGate: false,                                   // la pantalla de carga, tal como se ve al abrir
    colorScheme: 'dark',                               // el bug se reportó en modo oscuro
    viewport: { width: 393, height: 852 }              // iPhone 14 Pro, bajo el breakpoint de 480px
  });

  // Control positivo: si el gate no está visible, el test no está mirando la pantalla del bug y
  // cualquier verde sería falso.
  const gateVisible = await page.evaluate(() => {
    const g = document.getElementById('auth-gate');
    return !!g && !g.hidden && g.getBoundingClientRect().height > 100;
  });
  check('(control) el test está mirando la pantalla de carga, con el gate visible', gateVisible === true, gateVisible);

  // Se reproduce la condición del iPhone: .phone queda más corto que el viewport real. En un
  // Chromium de escritorio el safe-area vale 0, así que sin esto el hueco no existe y el test
  // pasaría en verde sin haber probado nada.
  const medido = await page.evaluate(() => {
    const ALTO_FRANJA = 92;  // --tabbar-height (58) + safe-area-inset-bottom de un iPhone (~34)
    document.documentElement.style.setProperty('--app-height', (window.innerHeight - ALTO_FRANJA) + 'px');
    // dos frames para que el layout se asiente antes de medir
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      const gate = document.getElementById('auth-gate');
      const cs = el => getComputedStyle(el).backgroundColor;
      const puntoY = window.innerHeight - Math.round(ALTO_FRANJA / 2);   // en plena franja
      const x = Math.round(window.innerWidth / 2);
      const elFranja = document.elementFromPoint(x, puntoY);
      // El color que realmente se ve en la franja: el primer ancestro con fondo no transparente.
      let colorFranja = null, cur = elFranja;
      while (cur && !colorFranja) {
        const c = cs(cur);
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') colorFranja = c;
        cur = cur.parentElement;
      }
      resolve({
        phoneBottom: Math.round(document.getElementById('phone').getBoundingClientRect().bottom),
        viewportH: window.innerHeight,
        colorGate: cs(gate),
        colorFranja,
        elFranja: elFranja ? (elFranja.id ? '#' + elFranja.id : '.' + String(elFranja.className).split(' ')[0]) : null,
        tabbarVisible: (() => { const t = document.querySelector('.tabbar'); return !!t && getComputedStyle(t).display !== 'none'; })()
      });
    })));
  });

  check('(control) se reprodujo el hueco: .phone queda más corto que el viewport real',
    medido.phoneBottom < medido.viewportH, medido);

  const d = distancia(medido.colorGate, medido.colorFranja);
  console.log('   gate=' + medido.colorGate + '  franja=' + medido.colorFranja + '  (elemento: ' + medido.elFranja + ', distancia ' + d + ')');
  check('lo que asoma bajo el gate es del MISMO color que el gate (no se ve una franja más clara)',
    d === 0, { gate: medido.colorGate, franja: medido.colorFranja, distancia: d });

  check('con el gate arriba, la barra de tabs no se muestra (no hay nada que navegar todavía)',
    medido.tabbarVisible === false, medido.tabbarVisible);

  // La otra mitad: esto NO debe romper la app ya cargada, donde el fondo --surface sí es la red
  // de seguridad correcta porque ahí la barra existe y es de ese mismo color.
  const yaCargada = await page.evaluate(() => {
    document.getElementById('auth-gate').hidden = true;
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      const tab = document.querySelector('.tabbar');
      resolve({
        bodyBg: getComputedStyle(document.body).backgroundColor,
        tabbarBg: tab ? getComputedStyle(tab).backgroundColor : null,
        tabbarVisible: !!tab && getComputedStyle(tab).display !== 'none'
      });
    })));
  });
  check('con la app ya cargada, la barra vuelve a mostrarse', yaCargada.tabbarVisible === true, yaCargada);
  check('   y ahí el fondo de atrás sí iguala a la barra (la red de seguridad original sigue intacta)',
    distancia(yaCargada.bodyBg, yaCargada.tabbarBg) === 0, yaCargada);

  await finish({ context, browser, errors });
})();
