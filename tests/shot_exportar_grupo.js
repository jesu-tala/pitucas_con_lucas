// Exportar info de un grupo a .xlsx (3 tabs del grupo -> 4 hojas: Integrantes, Transacciones,
// Detalle de división y Transferencias, ver group-export.ts). Cubre: (a) las filas puras que
// arma cada vista (sin necesitar SheetJS), (b) que el saldo neto de los integrantes suma cero,
// (c) que el detalle de división de cada transacción suma el total de esa transacción, (d) que
// tildes/ñ se preservan, y (e) que el .xlsx real (con SheetJS, vendorizado localmente para no
// depender de la red en los tests) se arma con las 4 hojas esperadas y esos mismos datos.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  const r = await page.evaluate(() => {
    const D = window.__debug;
    const groupId = 'gExport';
    D.GROUPS = [{ id: groupId, nombre: 'Depto con José Núñez', invite_code: 'abc123', creado_por: 'u1' }];
    D.GROUP_PARTICIPANTS = [
      { id: 'p1', grupo_id: groupId, user_id: 'u1', nombre: 'Ana', color: 'coral' },
      { id: 'p2', grupo_id: groupId, user_id: null, nombre: 'José Núñez', color: 'sky' }
    ];
    D.SHARED_EXPENSES = [
      {
        id: 'e1', grupo_id: groupId, descripcion: 'Supermercado', categoria_origen: 'Supermercado', monto: 10000,
        fecha: '2026-01-05', pagado_por: 'p1', registrado_por: 'u1', division_tipo: 'iguales', tx_origen_id: null,
        reparto: [{ id: 'r1', gasto_compartido_id: 'e1', participante_id: 'p1', monto: 5000 }, { id: 'r2', gasto_compartido_id: 'e1', participante_id: 'p2', monto: 5000 }]
      },
      {
        id: 'e2', grupo_id: groupId, descripcion: 'Bencina', categoria_origen: 'Transporte', monto: 6000,
        fecha: '2026-01-08', pagado_por: 'p2', registrado_por: 'u1', division_tipo: 'montos', tx_origen_id: null,
        reparto: [{ id: 'r3', gasto_compartido_id: 'e2', participante_id: 'p1', monto: 2000 }, { id: 'r4', gasto_compartido_id: 'e2', participante_id: 'p2', monto: 4000 }]
      }
    ];
    // p2 ya le pagó $1.000 a p1 de los $3.000 que le debía -- queda un saldo pendiente de $2.000.
    D.PAID_BALANCES = [{ id: 's1', grupo_id: groupId, de_participante: 'p2', a_participante: 'p1', monto: 1000, fecha: '2026-01-10' }];

    const integrantes = D.buildIntegrantesRows(groupId);
    const transacciones = D.buildTransaccionesRows(groupId);
    const detalle = D.buildDetalleDivisionRows(groupId);
    const transferencias = D.buildTransferenciasRows(groupId);

    const sumaSaldoNeto = integrantes.reduce((s, x) => s + x.saldoNeto, 0);
    const sumaDetalleE1 = detalle.filter(d => d.transaccion.indexOf('Supermercado') >= 0).reduce((s, d) => s + d.parte, 0);
    const sumaDetalleE2 = detalle.filter(d => d.transaccion.indexOf('Bencina') >= 0).reduce((s, d) => s + d.parte, 0);

    const buffer = D.buildGroupExportWorkbookArrayBuffer(groupId);
    const wb = window.XLSX.read(buffer, { type: 'array' });
    const sheetNames = wb.SheetNames;
    const integrantesSheet = window.XLSX.utils.sheet_to_json(wb.Sheets['Integrantes'], { header: 1 });

    return { integrantes, transacciones, detalle, transferencias, sumaSaldoNeto, sumaDetalleE1, sumaDetalleE2, sheetNames, integrantesSheet, xlsxByteLength: buffer.byteLength };
  });

  check('Integrantes: 2 filas (Ana y José Núñez)', r.integrantes.length === 2, r.integrantes);
  check('Integrantes: el saldo neto de todos suma cero', r.sumaSaldoNeto === 0, r);
  check('Integrantes: Ana quedó con +2.000 (le deben) tras el pago parcial', r.integrantes.find(x => x.nombre === 'Ana').saldoNeto === 2000, r.integrantes);
  check('Integrantes: José Núñez quedó con -2.000 (debe) -- tilde y ñ preservadas en el nombre', r.integrantes.find(x => x.nombre === 'José Núñez').saldoNeto === -2000, r.integrantes);

  check('Transacciones: 2 filas, con quién pagó y modo de división legible', r.transacciones.length === 2 && r.transacciones[0].quienPago === 'Ana' && r.transacciones[0].modoDivision === 'Por partes' && r.transacciones[1].modoDivision === 'Monto fijo', r.transacciones);

  check('Detalle de división: el de "Supermercado" suma su total ($10.000)', r.sumaDetalleE1 === 10000, r.detalle);
  check('Detalle de división: el de "Bencina" suma su total ($6.000)', r.sumaDetalleE2 === 6000, r.detalle);
  check('Detalle de división: formato largo -- una fila por participante por transacción (4 filas en total)', r.detalle.length === 4, r.detalle);

  check('Transferencias: incluye la YA SALDADA (José Núñez -> Ana, $1.000)', r.transferencias.some(t => t.estado === 'saldado' && t.de === 'José Núñez' && t.a === 'Ana' && t.monto === 1000), r.transferencias);
  check('Transferencias: incluye la PENDIENTE sugerida (José Núñez -> Ana, $2.000)', r.transferencias.some(t => t.estado === 'pendiente' && t.de === 'José Núñez' && t.a === 'Ana' && t.monto === 2000), r.transferencias);

  check('El .xlsx real trae las 4 hojas esperadas', JSON.stringify(r.sheetNames) === JSON.stringify(['Integrantes', 'Transacciones', 'Detalle de división', 'Transferencias']), r.sheetNames);
  check('El .xlsx no viene vacío', r.xlsxByteLength > 0, r.xlsxByteLength);
  check('La hoja Integrantes leída de vuelta del .xlsx trae el encabezado esperado', JSON.stringify(r.integrantesSheet[0]) === JSON.stringify(['Nombre', 'Saldo neto', 'Total pagado', 'Total que le corresponde']), r.integrantesSheet[0]);
  check('   y los datos de José Núñez, con tilde y ñ intactas tras el round-trip por el .xlsx', r.integrantesSheet.some(row => row[0] === 'José Núñez'), r.integrantesSheet);

  // El botón "Exportar info del grupo" debe estar visible en el detalle del grupo (en cualquier tab).
  await page.evaluate(() => {
    const D = window.__debug;
    D.state.tab = 'grupos';
    D.state.openGroupId = 'gExport';
    D.render();
  });
  await page.waitForTimeout(150);
  const botonExportar = await page.evaluate(() => !!document.querySelector('[data-export-group="gExport"]'));
  check('El botón "Exportar info del grupo (.xlsx)" aparece en el detalle del grupo', botonExportar);

  await finish({ context, browser, errors });
})();
