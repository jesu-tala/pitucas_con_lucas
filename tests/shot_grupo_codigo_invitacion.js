// Bug reportado: "no sé si está funcionando lo de compartir un código ya que no veo números en
// el grupo que ya existe". La hoja "Unirme a un grupo" (renderJoinGroupForm) siempre le decía
// que pidiera el código en "Menú del grupo -> Invitar", pero ese botón nunca se construyó: el
// grupo sí tenía invite_code (columna uuid que Supabase genera sola al crear el grupo, ver
// schema_gastos_compartidos.sql) pero nada en renderGroupDetail lo mostraba en ninguna parte --
// no había forma de verlo ni compartirlo. Este test cubre que ahora sí aparece, con su botón de
// copiar (mismo patrón data-copy-text que "Copiar Household ID" en Menú > Importar correo).
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.evaluate(() => {
    const D = window.__debug;
    D.currentUser = { id: 'user-jesu' };
    D.GROUPS = [{ id: 'g1', nombre: 'Depto', icono: '🏠', creado_por: 'user-jesu', invite_code: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', created_at: '' }];
    D.GROUP_PARTICIPANTS = [{ id: 'p1', grupo_id: 'g1', user_id: 'user-jesu', nombre: 'Yo', color: 'lavender' }];
    D.SHARED_EXPENSES = [];
    D.PAID_BALANCES = [];
    D.state.tab = 'grupos';
    D.state.openGroupId = 'g1';
    D.state.groupDetailTab = 'gastos';
    D.render();
  });
  await page.waitForTimeout(200);

  const detalle = await page.evaluate(() => {
    const input = document.querySelector('[data-copy-text="a1b2c3d4-e5f6-7890-abcd-ef1234567890"]');
    const cont = document.getElementById('view-root');
    return {
      tieneTitulo: cont.textContent.includes('Código de invitación'),
      inputMuestraElCodigo: !!Array.from(document.querySelectorAll('input.draft-input')).find(i => i.value === 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
      tieneBotonCopiar: !!input,
    };
  });
  check('El detalle del grupo muestra la sección "Código de invitación"', detalle.tieneTitulo, detalle);
  check('   con el código real del grupo (invite_code) visible en un campo', detalle.inputMuestraElCodigo, detalle);
  check('   y un botón para copiarlo', detalle.tieneBotonCopiar, detalle);

  // Tocar "copiar" dispara el mismo flujo genérico data-copy-text (navigator.clipboard) y un toast.
  await page.evaluate(() => {
    navigator.clipboard.writeText = (t) => { window.__copiado = t; return Promise.resolve(); };
  });
  await page.click('[data-copy-text="a1b2c3d4-e5f6-7890-abcd-ef1234567890"]');
  await page.waitForTimeout(150);
  const trasCopiar = await page.evaluate(() => ({
    copiado: window.__copiado,
    toast: document.getElementById('toast-stack').textContent,
  }));
  check('Tocar el botón copia el código de invitación al portapapeles', trasCopiar.copiado === 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', trasCopiar);
  check('   y confirma con un toast "Copiado"', /copiado/i.test(trasCopiar.toast), trasCopiar);

  // El texto de ayuda en "Unirme con un código" ya no manda a un menú que no existe.
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.openGroupId = null;
    D.state.joiningGroup = true;
    D.render();
  });
  await page.waitForTimeout(150);
  const ayuda = await page.evaluate(() => document.getElementById('view-root').textContent);
  check('La ayuda de "Unirme a un grupo" ya no referencia el inexistente "Menú del grupo -> Invitar"', !ayuda.includes('Menú del grupo'), ayuda);

  await finish({ context, browser, errors });
})();
