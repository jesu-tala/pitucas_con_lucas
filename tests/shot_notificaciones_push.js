// Real push notifications (part of the backend project: alert when a new transaction
// arrives and when a budget threshold is crossed). This test covers what can be
// tested without a real Supabase household/session: the Menu > Notifications screen, and the
// budget-threshold-crossing detection logic (checkBudgetPushAlerts) -- including the bug
// that was found and fixed: it used to mark an alert as "already sent" even when
// nothing had actually been attempted to send (for example, with no session/household loaded yet),
// which would have left that threshold crossing lost forever. Since the
// Worker was deployed (cloudflare-worker/worker.js) and its real URL was pasted into PUSH_WORKER_URL, this test
// runs with the Worker already "configured" -- what remains unresolved in this test environment is
// the Supabase household/token (D.sb/currentHouseholdId/state.importToken), which is exactly what
// keeps triggering the "not marked as sent" case below.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- Menu > Notifications screen ----------
  await page.click('[data-tab="menu"]');
  await page.waitForTimeout(150);
  const menuText = await page.evaluate(() => document.getElementById('view-root').textContent);
  check('El menú principal tiene la opción "Notificaciones"', menuText.includes('Notificaciones'));

  await page.click('[data-menu-open="notificaciones"]');
  await page.waitForTimeout(200);
  const pantalla = await page.evaluate(() => {
    const root = document.getElementById('view-root');
    return {
      titulo: document.querySelector('.menu-screen-title')?.textContent || '',
      texto: root.textContent,
      hayBotonToggle: !!document.querySelector('[data-notif-toggle]'),
    };
  });
  check('Se abre la pantalla "Notificaciones"', pantalla.titulo === 'Notificaciones', pantalla);
  check('Explica los dos avisos (transacción nueva y presupuesto)', /transacci[oó]n nueva/i.test(pantalla.texto) && /presupuesto/i.test(pantalla.texto), pantalla.texto);
  check('Tiene un botón para activar/desactivar en este dispositivo (o explica que el navegador no lo soporta)', pantalla.hayBotonToggle || /no soporta/i.test(pantalla.texto), pantalla);

  // ---------- checkBudgetPushAlerts: detects a threshold crossing ----------
  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    const hoy = D.todayISO();
    const mes = hoy.slice(0,7);

    // Test category with a low goal so it's easy to cross, and all 3 thresholds enabled.
    D.BUDGETS['supermercado'] = { meta: 10000, alertas: { 80: true, 90: true, 100: true } };
    // Clear any previous alert from earlier months/tests for this case.
    Object.keys(D.BUDGET_ALERTS_SENT).forEach(k => { if (k.startsWith('supermercado|')) delete D.BUDGET_ALERTS_SENT[k]; });

    // A TODAY expense in supermercado that crosses 100% of a $10,000 goal.
    D.TRANSACTIONS.push({
      id: 'test-push-1', fecha: hoy, hora: '12:00', comercio: 'Test Jumbo', monto: 12000,
      medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'supermercado', monto: 12000 }], porCobrar: [], reglaAuto: false, nota: ''
    });

    const workerConfiguradoAntes = D.pushWorkerConfigured();
    D.checkBudgetPushAlerts();
    const avisosTrasPrimeraLlamada = Object.assign({}, D.BUDGET_ALERTS_SENT);

    // Called again with nothing changed -- it should not try to send anything else or
    // fail (idempotent).
    D.checkBudgetPushAlerts();
    const avisosTrasSegundaLlamada = Object.assign({}, D.BUDGET_ALERTS_SENT);

    return { mes, workerConfiguradoAntes, avisosTrasPrimeraLlamada, avisosTrasSegundaLlamada };
  });

  check('El Worker de push ya está configurado en este build (PUSH_WORKER_URL ya no es el placeholder)', resultado.workerConfiguradoAntes === true, resultado.workerConfiguradoAntes);
  const key80 = 'supermercado|' + resultado.mes + '|80';
  const key100 = 'supermercado|' + resultado.mes + '|100';
  check('Sin hogar/sesión de Supabase en este entorno de test, NO marca el aviso como enviado (si lo marcara, se perdería para siempre el día que sí haya sesión)', !resultado.avisosTrasPrimeraLlamada[key80] && !resultado.avisosTrasPrimeraLlamada[key100], resultado.avisosTrasPrimeraLlamada);
  check('Llamarlo de nuevo sin cambios no revienta ni cambia nada (idempotente)', JSON.stringify(resultado.avisosTrasPrimeraLlamada) === JSON.stringify(resultado.avisosTrasSegundaLlamada), resultado);

  // ---------- dedup: a threshold already marked as alerted is not "resent" ----------
  const dedup = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.todayISO().slice(0,7);
    const key80 = 'supermercado|' + mes + '|80';
    // Simulate that the 80% had ALREADY been alerted in a previous run (with the Worker configured).
    D.BUDGET_ALERTS_SENT[key80] = true;
    D.checkBudgetPushAlerts();
    // Still marked (it's not "unmarked" nor re-evaluated as if it were new).
    return D.BUDGET_ALERTS_SENT[key80];
  });
  check('Un umbral ya marcado como avisado se mantiene así (no se re-evalúa cada vez)', dedup === true, dedup);

  // ---------- alert text: "Categoría: has alcanzado el X% de tu presupuesto mensual!" ----------
  const aviso = await page.evaluate(() => window.__debug.budgetAlertText('Supermercado', 80, 8000, 10000));
  check('El título del push dice "[Categoría]: has alcanzado el [X]% de tu presupuesto mensual!"', aviso.titulo === 'Supermercado: has alcanzado el 80% de tu presupuesto mensual!', aviso);
  check('El mensaje del push muestra el gasto y la meta en pesos', aviso.mensaje === '$8.000 de $10.000', aviso);

  await finish({ context, browser, errors });
})();
