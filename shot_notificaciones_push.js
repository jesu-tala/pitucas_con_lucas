// Notificaciones push reales (parte del proyecto de backend: avisar cuando llega una
// transacción nueva y cuando se cruza un umbral de presupuesto). Este test cubre lo que se
// puede probar sin un hogar/sesión real de Supabase: la pantalla de Menú > Notificaciones, y la
// lógica de detección de cruce de presupuesto (checkPresupuestoPushAvisos) -- incluyendo el bug
// que se encontró y arregló: antes marcaba un aviso como "ya enviado" incluso cuando en
// realidad no se había intentado mandar nada (por ejemplo, sin sesión/hogar todavía cargado),
// lo que habría dejado ese cruce de umbral perdido para siempre. Desde que se desplegó el
// Worker (cloudflare-worker/worker.js) y se pegó su URL real en PUSH_WORKER_URL, esta prueba
// corre con el Worker ya "configurado" -- lo que queda sin resolver en este entorno de test es
// el hogar/token de Supabase (D.sb/currentHouseholdId/state.importToken), que es justo lo que
// sigue gatillando el "no se marca como enviado" de más abajo.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  // ---------- pantalla Menú > Notificaciones ----------
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

  // ---------- checkPresupuestoPushAvisos: detecta el cruce de un umbral ----------
  const resultado = await page.evaluate(() => {
    const D = window.__debug;
    const hoy = D.todayISO();
    const mes = hoy.slice(0,7);

    // Categoría de prueba con meta baja para cruzarla fácil, y los 3 umbrales activados.
    D.PRESUPUESTOS['supermercado'] = { meta: 10000, alertas: { 80: true, 90: true, 100: true } };
    // Limpia cualquier aviso previo de meses/tests anteriores para este caso.
    Object.keys(D.PRESUPUESTO_AVISOS_ENVIADOS).forEach(k => { if (k.startsWith('supermercado|')) delete D.PRESUPUESTO_AVISOS_ENVIADOS[k]; });

    // Un gasto de HOY en supermercado que cruza el 100% de una meta de $10.000.
    D.TX.push({
      id: 'test-push-1', fecha: hoy, hora: '12:00', comercio: 'Test Jumbo', monto: 12000,
      medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'supermercado', monto: 12000 }], porCobrar: [], reglaAuto: false, nota: ''
    });

    const workerConfiguradoAntes = D.pushWorkerConfigured();
    D.checkPresupuestoPushAvisos();
    const avisosTrasPrimeraLlamada = Object.assign({}, D.PRESUPUESTO_AVISOS_ENVIADOS);

    // Se vuelve a llamar sin que nada haya cambiado -- no debería intentar mandar nada más ni
    // fallar (idempotente).
    D.checkPresupuestoPushAvisos();
    const avisosTrasSegundaLlamada = Object.assign({}, D.PRESUPUESTO_AVISOS_ENVIADOS);

    return { mes, workerConfiguradoAntes, avisosTrasPrimeraLlamada, avisosTrasSegundaLlamada };
  });

  check('El Worker de push ya está configurado en este build (PUSH_WORKER_URL ya no es el placeholder)', resultado.workerConfiguradoAntes === true, resultado.workerConfiguradoAntes);
  const key80 = 'supermercado|' + resultado.mes + '|80';
  const key100 = 'supermercado|' + resultado.mes + '|100';
  check('Sin hogar/sesión de Supabase en este entorno de test, NO marca el aviso como enviado (si lo marcara, se perdería para siempre el día que sí haya sesión)', !resultado.avisosTrasPrimeraLlamada[key80] && !resultado.avisosTrasPrimeraLlamada[key100], resultado.avisosTrasPrimeraLlamada);
  check('Llamarlo de nuevo sin cambios no revienta ni cambia nada (idempotente)', JSON.stringify(resultado.avisosTrasPrimeraLlamada) === JSON.stringify(resultado.avisosTrasSegundaLlamada), resultado);

  // ---------- dedup: un umbral ya marcado como avisado no se vuelve a "reenviar" ----------
  const dedup = await page.evaluate(() => {
    const D = window.__debug;
    const mes = D.todayISO().slice(0,7);
    const key80 = 'supermercado|' + mes + '|80';
    // Simula que el 80% YA se había avisado en una corrida anterior (con el Worker configurado).
    D.PRESUPUESTO_AVISOS_ENVIADOS[key80] = true;
    D.checkPresupuestoPushAvisos();
    // Sigue marcado (no se "desmarca" ni se vuelve a evaluar como si fuera nuevo).
    return D.PRESUPUESTO_AVISOS_ENVIADOS[key80];
  });
  check('Un umbral ya marcado como avisado se mantiene así (no se re-evalúa cada vez)', dedup === true, dedup);

  // ---------- texto del aviso: "Categoría: has alcanzado el X% de tu presupuesto mensual!" ----------
  const aviso = await page.evaluate(() => window.__debug.presupuestoAvisoTexto('Supermercado', 80, 8000, 10000));
  check('El título del push dice "[Categoría]: has alcanzado el [X]% de tu presupuesto mensual!"', aviso.titulo === 'Supermercado: has alcanzado el 80% de tu presupuesto mensual!', aviso);
  check('El mensaje del push muestra el gasto y la meta en pesos', aviso.mensaje === '$8.000 de $10.000', aviso);

  await finish({ context, browser, errors });
})();
