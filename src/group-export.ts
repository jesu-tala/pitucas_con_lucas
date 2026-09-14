import { PAID_BALANCES } from './state';
import { expensesOfGroup, participantsOfGroup, groupBalances, suggestedTransfers } from './shared-expenses';
import { SplitType } from './types';

// Mismas etiquetas que usa el selector de "dividir este gasto" en la UI (ver GROUP_TABS_META /
// el picker de modalidad en views/grupos.ts) -- para que lo exportado diga lo mismo que ella ve
// en pantalla, en vez de inventar un vocabulario nuevo solo para el archivo.
const SPLIT_TYPE_LABELS: Record<SplitType, string> = { iguales: 'Por partes', pct: 'Por %', montos: 'Monto fijo' };
export function splitTypeLabel(tipo: SplitType): string {
  return SPLIT_TYPE_LABELS[tipo] || tipo;
}

// ---- Filas puras (sin DOM ni SheetJS) para cada una de las 4 vistas del export -- testeables
// directamente contra el estado en memoria, igual que el resto del motor de balances. ----

export function buildIntegrantesRows(groupId: string) {
  return groupBalances(groupId).map(b => ({
    nombre: b.nombre,
    saldoNeto: Math.round(b.balance),
    totalPagado: Math.round(b.paid),
    totalLeCorresponde: Math.round(b.owed)
  }));
}

export function buildTransaccionesRows(groupId: string) {
  const participantes = participantsOfGroup(groupId);
  return expensesOfGroup(groupId).slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(g => {
    const pagador = participantes.find(p => p.id === g.pagado_por);
    return {
      fecha: g.fecha,
      descripcion: g.descripcion,
      categoria: g.categoria_origen || '',
      montoTotal: Math.round(g.monto),
      quienPago: pagador ? pagador.nombre : '?',
      modoDivision: splitTypeLabel(g.division_tipo)
    };
  });
}

// Formato LARGO (una fila por participante por transacción) para que no dependa de cuántos
// participantes tenga cada gasto -- una tabla ancha (una columna por persona) se rompería en
// cuanto hubiera más participantes que columnas previstas.
export function buildDetalleDivisionRows(groupId: string) {
  const participantes = participantsOfGroup(groupId);
  const rows: { transaccion: string; participante: string; parte: number }[] = [];
  expensesOfGroup(groupId).slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(g => {
    (g.reparto || []).forEach(r => {
      const p = participantes.find(pp => pp.id === r.participante_id);
      rows.push({
        transaccion: g.fecha + ' — ' + g.descripcion,
        participante: p ? p.nombre : '?',
        parte: Math.round(r.monto)
      });
    });
  });
  return rows;
}

// Junta las transferencias YA saldadas (PAID_BALANCES, con fecha) con las sugeridas por el motor
// de saldo mínimo que todavía están pendientes (suggestedTransfers, sin fecha porque nunca se
// registran hasta que se marcan como pagadas) -- así la hoja muestra el historial completo Y lo
// que falta por saldar, no solo una de las dos partes.
export function buildTransferenciasRows(groupId: string) {
  const participantes = participantsOfGroup(groupId);
  const nombreDe = (id: string) => { const p = participantes.find(x => x.id === id); return p ? p.nombre : '?'; };
  const saldadas = PAID_BALANCES.filter(s => s.grupo_id === groupId).map(s => ({
    fecha: s.fecha, de: nombreDe(s.de_participante), a: nombreDe(s.a_participante), monto: Math.round(s.monto), estado: 'saldado'
  }));
  const pendientes = suggestedTransfers(groupId).map(t => ({
    fecha: '', de: nombreDe(t.from), a: nombreDe(t.to), monto: Math.round(t.monto), estado: 'pendiente'
  }));
  return saldadas.concat(pendientes);
}

// Arma las 4 hojas como arreglos-de-arreglos (encabezado + filas), listos para
// XLSX.utils.aoa_to_sheet -- separado de la escritura del .xlsx real para que esta parte
// (la que importa: qué datos salen) se pueda testear sin necesitar la librería SheetJS cargada.
export function groupExportSheets(groupId: string): Record<string, (string | number)[][]> {
  return {
    'Integrantes': ([['Nombre', 'Saldo neto', 'Total pagado', 'Total que le corresponde']] as (string | number)[][]).concat(
      buildIntegrantesRows(groupId).map(r => [r.nombre, r.saldoNeto, r.totalPagado, r.totalLeCorresponde])
    ),
    'Transacciones': ([['Fecha', 'Descripción', 'Categoría', 'Monto total', 'Quién pagó', 'Modo de división']] as (string | number)[][]).concat(
      buildTransaccionesRows(groupId).map(r => [r.fecha, r.descripcion, r.categoria, r.montoTotal, r.quienPago, r.modoDivision])
    ),
    'Detalle de división': ([['Transacción', 'Participante', 'Parte que le toca']] as (string | number)[][]).concat(
      buildDetalleDivisionRows(groupId).map(r => [r.transaccion, r.participante, r.parte])
    ),
    'Transferencias': ([['Fecha', 'De', 'A', 'Monto', 'Estado']] as (string | number)[][]).concat(
      buildTransferenciasRows(groupId).map(r => [r.fecha, r.de, r.a, r.monto, r.estado])
    )
  };
}

// Construye el .xlsx real (ArrayBuffer) usando SheetJS, cargado como global `XLSX` desde CDN en
// plata-clara.html (nunca sale del teléfono -- se arma entero en el navegador). Separado de
// groupExportSheets de propósito: esa función (los datos) se puede testear sin SheetJS cargado,
// esta (el binario) no tiene lógica propia que valga la pena testear aparte del round-trip.
export function buildGroupExportWorkbookArrayBuffer(groupId: string): ArrayBuffer {
  const XLSXLib = (window as any).XLSX;
  const sheets = groupExportSheets(groupId);
  const wb = XLSXLib.utils.book_new();
  Object.keys(sheets).forEach(name => {
    const ws = XLSXLib.utils.aoa_to_sheet(sheets[name]);
    XLSXLib.utils.book_append_sheet(wb, ws, name);
  });
  return XLSXLib.write(wb, { bookType: 'xlsx', type: 'array' });
}
