const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ debug: false, hideGate: false, waitAfter: 0 });

  // Right after load, before sb.auth.getSession() resolves, the login form shouldn't be
  // visible yet -- only the neutral loader. THIS IS ONLY OBSERVABLE when
  // window.supabase loaded (sb isn't null) and getSession() is genuinely pending: there's
  // a real async instant separating "checking" from "form". This sandbox has no network, so
  // the Supabase script never loads, sb stays null, and plata-clara.html takes the
  // SYNCHRONOUS branch (`else` of `if(sb){...}`) that resolves to "show the form" before
  // page.goto() even returns control -- there's no intermediate frame to observe,
  // it's not a race condition in the test, it's a consequence of not having network in the sandbox.
  const initial = await page.evaluate(() => {
    const checking = document.getElementById('auth-checking');
    const content = document.getElementById('auth-content');
    return { checkingHidden: checking.hidden, contentHidden: content.hidden, hasSb: !!window.supabase };
  });
  console.log('Estado inicial (justo al cargar, antes de resolver sesión):', JSON.stringify(initial));
  if (initial.hasSb) {
    // With Supabase actually loaded, there really is a real async wait -- here the flash matters.
    check('Estado inicial: checking visible', !initial.checkingHidden);
    check('Estado inicial: form de login oculto', initial.contentHidden);
  } else {
    console.log('  (sin red en este sandbox: window.supabase nunca cargó, así que la rama síncrona ya decidió mostrar el formulario -- no hay estado "checking" que observar. Se omiten esos 2 checks, no aplican acá.)');
  }

  await page.waitForTimeout(1500); // give getSession() (or its catch) time to resolve

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
