// Hallazgo crítico de la auditoría: la app arma todas sus pantallas concatenando strings y
// asignándolas con .innerHTML, y NINGÚN texto escrito por una persona se escapaba antes de
// concatenarse. Verificado en su momento inyectando payloads reales: se ejecutaban los 5
// vectores probados.
//
// Lo grave no es hacerse daño a una misma: el nombre de un participante, el de un grupo y la
// descripción de un gasto compartido los escribe OTRA persona y viajan por Supabase al navegador
// de todos los miembros del grupo -- así que cualquiera que se uniera a un grupo podía ejecutar
// código en la sesión de los demás (y el cliente de Supabase guarda la sesión en localStorage,
// o sea que alcanza para robársela).
//
// Este test bloquea la regresión: inyecta un payload que deja huella al ejecutarse en cada campo
// de texto libre, y exige que NINGUNO se ejecute. Además comprueba que el texto se siga viendo
// tal cual se escribió -- un escape que "arregla" el problema borrando el contenido no sirve.
const { openApp, check, finish } = require('./lib/test_kit');

const PAYLOAD = (marca) => '<img src=x onerror="window.__XSS__.push(\'' + marca + '\')">';

(async () => {
  const { context, browser, page, errors } = await openApp();
  await page.evaluate(() => { window.__XSS__ = []; });

  // ---------- 1) Campos propios: comercio, nota, categoría (nombre e ícono) ----------
  await page.evaluate((p) => {
    const D = window.__debug;
    D.CATEGORIES.xsscat = { nombre: p.cat, tipo: 'gasto', colorHue: 100, icon: p.icono };
    D.TRANSACTIONS.length = 0;
    D.TRANSACTIONS.push({
      id: 'x1', fecha: D.todayISO(), hora: '10:00', comercio: p.comercio, monto: 1000,
      medio: 'efectivo', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
      categorias: [{ cat: 'xsscat', monto: 1000 }], porCobrar: [], reglaAuto: false, nota: p.nota
    });
    D.state.tab = 'transacciones';
    D.render();
  }, { comercio: PAYLOAD('comercio'), nota: PAYLOAD('nota'), cat: PAYLOAD('categoria'), icono: PAYLOAD('icono') });
  await page.waitForTimeout(250);

  // El detalle de la transacción (otro conjunto de puntos de interpolación que la lista).
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.openTxId = 'x1';
    document.getElementById('sheet-overlay').classList.add('open');
    D.render();
  });
  await page.waitForTimeout(250);

  // ---------- 2) Datos que vienen de OTRA persona (grupos compartidos) ----------
  await page.evaluate((p) => {
    const D = window.__debug;
    D.currentUser = { id: 'user-victima' };
    D.GROUPS = [{ id: 'g1', nombre: p.grupo, icono: p.icono, creado_por: 'user-atacante', invite_code: 'x', created_at: '' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: 'g1', user_id: 'user-victima', nombre: 'Yo', color: 'lavender' },
      // `color` también lo puede escribir otro miembro desde la API, y se interpola dentro de
      // un style="..." -- una comilla ahí se salía del atributo.
      { id: 'p2', grupo_id: 'g1', user_id: 'user-atacante', nombre: p.participante, color: p.color }
    ];
    D.SHARED_EXPENSES = [{
      id: 'se1', grupo_id: 'g1', descripcion: p.descripcion, categoria_origen: null, monto: 20000,
      fecha: D.todayISO(), pagado_por: 'p2', registrado_por: 'user-atacante',
      division_tipo: 'iguales', tx_origen_id: null,
      reparto: [
        { id: 'r1', gasto_compartido_id: 'se1', participante_id: 'p1', monto: 10000 },
        { id: 'r2', gasto_compartido_id: 'se1', participante_id: 'p2', monto: 10000 }
      ]
    }];
    D.state.openTxId = null;
    document.getElementById('sheet-overlay').classList.remove('open');
    D.state.tab = 'grupos';
    D.state.openGroupId = 'g1';
    ['gastos', 'balances', 'transferencias'].forEach(tab => { D.state.groupDetailTab = tab; D.render(); });
  }, {
    grupo: PAYLOAD('grupo'), participante: PAYLOAD('participante'), descripcion: PAYLOAD('descripcion'),
    icono: PAYLOAD('grupoIcono'), color: 'x;"><img src=y onerror="window.__XSS__.push(\'color\')">'
  });
  await page.waitForTimeout(300);

  // ---------- 3) Toast (se pinta con innerHTML y casi siempre lleva texto de la usuaria) ----------
  await page.evaluate((p) => { window.__debug.toast('Regla creada para ' + p); }, PAYLOAD('toast'));
  await page.waitForTimeout(250);

  // ---------- 4) Otras familias de texto libre: datos de transferencia y contactos ----------
  await page.evaluate((p) => {
    const D = window.__debug;
    D.TRANSFER_INFO = { nombre: p.x, rut: p.x, banco: p.x, tipoCuenta: p.x, numeroCuenta: p.x, email: p.x };
    D.CONTACTS = [p.x];
    D.state.tab = 'menu';
    D.state.menuSection = 'mi-cuenta';
    D.state.editingTransferInfo = false;
    D.render();
    D.state.editingTransferInfo = true;
    D.state.transferInfoDraft = Object.assign({}, D.TRANSFER_INFO);
    D.render();
  }, { x: PAYLOAD('transferencia') });
  await page.waitForTimeout(300);

  const ejecutados = await page.evaluate(() => window.__XSS__.slice());
  check('NINGÚN payload se ejecuta (comercio, nota, categoría, ícono, grupo, participante, color, descripción, toast, datos de transferencia)',
    ejecutados.length === 0, ejecutados);

  // ---------- 4) El texto se sigue viendo: escapar no puede tragarse el contenido ----------
  const visible = await page.evaluate(() => document.body.innerText);
  check('el texto inyectado se muestra como texto literal, no desaparece', visible.includes('<img src=x onerror='), visible.slice(0, 200));

  // ---------- 5) Y no quedó markup vivo inyectado en el DOM ----------
  const imgsInyectadas = await page.evaluate(() => document.querySelectorAll('img[src="x"], img[src="y"]').length);
  check('no se creó ningún elemento <img> a partir del texto (quedó como texto, no como markup)', imgsInyectadas === 0, imgsInyectadas);

  await finish({ context, browser, errors });
})();
