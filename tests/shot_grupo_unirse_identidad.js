// Refinamiento A de grupos: identidad del participante al unirse.
// Bug real: unirse_a_grupo() siempre creaba un participante NUEVO con el nombre que se
// escribiera, sin mostrar antes quiénes ya están en el grupo -- confundía el nombre del GRUPO
// con la identidad de quien se une, y nunca dejaba vincularse a un participante YA EXISTENTE
// (ej. alguien que Fran ya había agregado sin cuenta, "Pancho") -- terminaba duplicado.
// Ahora: código -> roster completo (nombres visibles para cualquiera con el código) -> elegir
// "cuál eres tú" (reclamar un participante sin reclamar) o "no estoy en la lista" (agregarte
// como nuevo). El write real a Supabase (fetchGroupRoster/claimParticipant/joinGroup) no se
// puede probar de punta a punta acá (sb bloqueado en el sandbox, mismo patrón que el resto de
// Grupos) -- este test cubre lo que SÍ es puramente UI/estado local: que se ve el roster
// completo, que un participante ya reclamado no se puede seleccionar, que "no estoy en la
// lista" habilita agregarte, y que el nombre del grupo nunca se usa como el tuyo.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => { window.__debug.state.tab = 'grupos'; window.__debug.render(); });
  await page.waitForTimeout(150);
  await page.click('[data-group-join-open]');
  await page.waitForTimeout(150);

  // ---------- Paso 1: solo pide el código -- el nombre del grupo no existe todavía acá ----------
  const paso1 = await page.evaluate(() => ({
    tieneCampoNombre: !!document.querySelector('[data-join-draft-field="nombre"]'),
    tieneCampoCodigo: !!document.querySelector('[data-join-draft-field="inviteCode"]'),
  }));
  check('Paso 1: solo pide el código de invitación (todavía no pide "tu nombre")', paso1.tieneCampoCodigo && !paso1.tieneCampoNombre, paso1);

  // Simula que fetchGroupRoster() ya trajo el roster (sb bloqueado en el sandbox -- ver nota
  // arriba) -- el resto del flujo es 100% UI/estado local, así que se puede probar igual.
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.joinDraft.inviteCode = 'CODE123';
    D.state.joinDraft.roster = {
      grupoId: 'g1', grupoNombre: 'Depto con Caro', grupoIcono: '🏠',
      participantes: [
        { id: 'p1', nombre: 'Caro', reclamado: true },
        { id: 'p2', nombre: 'Pancho', reclamado: false },
      ]
    };
    D.render();
  });
  await page.waitForTimeout(150);

  // ---------- (a) Al unirse se ve el roster completo (nombres visibles para todos) ----------
  const roster = await page.evaluate(() => ({
    titulo: document.querySelector('.menu-screen-title')?.textContent,
    texto: document.getElementById('view-root').textContent,
  }));
  check('(a) Se ve el roster completo del grupo (Caro Y Pancho, ambos nombres visibles)', roster.texto.includes('Caro') && roster.texto.includes('Pancho'), roster.texto.slice(0, 400));
  check('   el título de la pantalla usa el nombre del GRUPO ("Depto con Caro"), separado de tu identidad', roster.titulo.includes('Depto con Caro'), roster.titulo);

  // ---------- (c) NO se puede reclamar un participante ya reclamado (Caro) ----------
  const radioCaro = await page.evaluate(() => {
    const el = document.querySelector('[data-join-select-participant="p1"]');
    return el ? { disabled: el.disabled } : null;
  });
  check('(c) El radio de un participante YA reclamado (Caro) está deshabilitado -- no se puede elegir', radioCaro && radioCaro.disabled === true, radioCaro);

  // ---------- (b) Se puede reclamar un participante SIN reclamar (Pancho) ----------
  await page.click('[data-join-select-participant="p2"]');
  await page.waitForTimeout(150);
  const conPancho = await page.evaluate(() => ({
    seleccionado: document.querySelector('[data-join-select-participant="p2"]').checked,
    botonHabilitado: !document.querySelector('[data-group-join-confirm]').disabled,
  }));
  check('(b) Se puede seleccionar un participante SIN reclamar (Pancho) y el botón "Unirme" se habilita', conPancho.seleccionado && conPancho.botonHabilitado, conPancho);

  // ---------- (d) "No estoy en la lista" habilita agregarte como nuevo participante ----------
  await page.click('[data-join-select-nuevo]');
  await page.waitForTimeout(150);
  const comoNuevo = await page.evaluate(() => ({
    tieneCampoNombre: !!document.querySelector('[data-join-draft-field="nombre"]'),
    yaNoSeleccionaPancho: !document.querySelector('[data-join-select-participant="p2"]').checked,
  }));
  check('(d) "No estoy en la lista" muestra el campo para tu nombre nuevo', comoNuevo.tieneCampoNombre, comoNuevo);
  check('   y deselecciona cualquier participante elegido antes', comoNuevo.yaNoSeleccionaPancho, comoNuevo);

  await page.fill('[data-join-draft-field="nombre"]', 'Josefina');
  await page.waitForTimeout(150);
  const nombrePropio = await page.evaluate(() => window.__debug.state.joinDraft.nombre);
  check('   escribir tu nombre queda en el draft (nunca el del grupo)', nombrePropio === 'Josefina' && nombrePropio !== 'Depto con Caro', nombrePropio);

  await finish({ context, browser, errors });
})();
