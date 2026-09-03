// pdf.js se carga como <script src> externo (CDN o copia local para tests) -- no es un módulo,
// así que su global no lo declara este archivo.
declare const pdfjsLib: any;
// El cliente de Supabase también se carga como <script src> externo y se cuelga de window.
interface Window { supabase: any; }
