// pdf.js loads as an external <script src> (CDN or a local copy for tests) -- it's not a
// module, so this file doesn't declare its global.
declare const pdfjsLib: any;
// The Supabase client also loads as an external <script src> and hangs off window.
interface Window { supabase: any; }
