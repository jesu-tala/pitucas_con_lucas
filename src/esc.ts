/* ===================== ESCAPAR TEXTO PARA HTML =====================
   Toda esta app arma sus pantallas concatenando strings y asignándolas con .innerHTML (ver
   render.ts y cada render* de views/), así que CUALQUIER texto que haya escrito una persona --
   el comercio de una transacción, una nota, el nombre de una categoría, de un grupo, de un
   participante, la descripción de un gasto compartido -- tiene que pasar por esc() antes de
   concatenarse. Sin eso, escribir `<img src=x onerror=...>` como nombre de comercio no queda
   como texto: el navegador lo ejecuta apenas se dibuja la fila (verificado, no es teórico).

   El caso grave no es hacerse daño a una misma, sino los grupos compartidos: el nombre de un
   participante y la descripción de un gasto los escribe OTRA persona y viajan por Supabase hasta
   el navegador de todos los miembros del grupo. Sin escapar, cualquiera que se una a un grupo
   puede ejecutar código en la sesión de los demás -- y el cliente de Supabase guarda la sesión
   en localStorage, así que eso alcanza para robársela.

   Vive en su propio archivo, sin ningún import, a propósito: lo necesitan tanto helpers.ts como
   icons.ts, y si viviera en helpers.ts (que importa sheet.ts, que importa icons.ts) meter el
   import en icons.ts cerraría un ciclo. Un módulo hoja no tiene ese problema y deja una sola
   fuente de verdad para el escape. */

// Escapa los 5 caracteres que importan, y con eso sirve igual para texto suelto que para el
// valor de un atributo entrecomillado (`value="..."`, `aria-label="..."`, `style="..."`): la
// comilla doble y la simple también se escapan, así que no hay forma de salirse del atributo.
// El & va primero: si no, se re-escaparían los & que introducen los reemplazos siguientes.
// Acepta cualquier cosa (null/undefined/número) para poder envolver sin revisar el tipo en cada
// punto de uso.
export function esc(v: any): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
