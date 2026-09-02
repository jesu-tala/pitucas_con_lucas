const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ debug: false, hideGate: false, waitAfter: 0 });

  // Justo al cargar, antes de que se resuelva sb.auth.getSession(), no debería verse el
  // formulario de login todavía -- solo el loader neutro. ESTO SOLO ES OBSERVABLE cuando
  // window.supabase se cargó (sb no es null) y getSession() queda pendiente de verdad: hay
  // un instante async real que separar "checking" de "form". Este sandbox no tiene red, así
  // que el script de Supabase nunca carga, sb queda null, y plata-clara.html toma la rama
  // SÍNCRONA (`else` de `if(sb){...}`) que resuelve "mostrar el formulario" antes de que
  // page.goto() siquiera devuelva el control -- no hay ningún frame intermedio que observar,
  // no es una condición de carrera del test, es una consecuencia de no tener el sandbox red.
  const initial = await page.evaluate(() => {
    const checking = document.getElementById('auth-checking');
    const content = document.getElementById('auth-content');
    return { checkingHidden: checking.hidden, contentHidden: content.hidden, hasSb: !!window.supabase };
  });
  console.log('Estado inicial (justo al cargar, antes de resolver sesión):', JSON.stringify(initial));
  if (initial.hasSb) {
    // Con Supabase realmente cargado, sí hay una espera async real -- acá el flash importa.
    check('Estado inicial: checking visible', !initial.checkingHidden);
    check('Estado inicial: form de login oculto', initial.contentHidden);
  } else {
    console.log('  (sin red en este sandbox: window.supabase nunca cargó, así que la rama síncrona ya decidió mostrar el formulario -- no hay estado "checking" que observar. Se omiten esos 2 checks, no aplican acá.)');
  }

  await page.waitForTimeout(1500); // dar tiempo a que getSession() (o su catch) resuelva

  const after = await page.evaluate(() => {
    const checking = document.getElementById('auth-checking');
    const content = document.getElementById('auth-content');
    const gate = document.getElementById('auth-gate');
    return { checkingHidden: checking.hidden, contentHidden: content.hidden, gateHidden: gate.hidden };
  });
  console.log('Estado después de resolver (sin sesión real posible en este sandbox):', JSON.stringify(after));
  check('Ya se decidió mostrar el formulario (checking oculto, content visible)', after.checkingHidden && !after.contentHidden);

  await finish({ context, browser, errors });
})();
