/* ===================== ENTRY POINT =====================
   Este archivo es lo único que apunta rebuild.py a tsc/esbuild -- ver tsconfig.json e
   "include". Ya no es una sola IIFE gigante: importa cada módulo bajo src/ (uno por
   sección/vista, ver DOCUMENTACION.md sección 2) y, al final, corre exactamente el mismo
   código de arranque que corría al final del app.ts original de una sola pieza (registrar
   listeners, hacer el primer render() con los datos de ejemplo, y recién después arrancar
   Supabase/auth) -- el orden importa, por eso initSupabaseAuth() se llama a mano acá, después
   del primer render(), en vez de dejar que Supabase se auto-ejecute con solo importar ese
   módulo (ver la nota junto a "export let sb" en supabase.ts). esbuild empaqueta todos estos
   módulos en un único IIFE (--format=iife), así que el resultado final sigue siendo el mismo
   script autocontenido de siempre. */

import { ICONS } from './icons';
import './state';
import './helpers';
import { regenerateCuotasFor } from './shared-expenses';
import './ui/toasts';
import './ui/tabbar';
import './ui/donut';
import './views/transacciones';
import './views/presupuesto';
import './views/evolucion';
import './views/inversiones';
import './views/menu';
import './views/grupos';
import { render } from './render';
import './sheet';
import './events';
import { initSupabaseAuth } from './supabase';

/* ---------- alto real de pantalla en modo "agregado a inicio" (PWA standalone) ----------
   En iOS, cuando la app está agregada a la pantalla de inicio (sin barra de navegador),
   a veces el primer dibujo usa un alto de pantalla que todavía no incluye del todo el área
   bajo la barra de estado / sobre el "home indicator" — 100dvh y env(safe-area-inset-bottom)
   deberían resolverlo solos, pero en algunos iPhone queda un resto de espacio vacío (del
   color de fondo de la página) debajo de la barra inferior hasta que la app se repinta.
   Guardamos el alto real en una variable CSS y la recalculamos ante cualquier evento que
   pueda cambiarlo, para que .phone (que la usa como respaldo de 100dvh) siempre calce con
   la pantalla real y no se quede pegada a una medida vieja. */
function setAppHeight(){
  document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
}
setAppHeight();
['resize','orientationchange','pageshow','visibilitychange'].forEach(function(ev){
  window.addEventListener(ev, setAppHeight);
});
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', setAppHeight);
}

document.getElementById('fab-add').innerHTML = ICONS.plus;
document.getElementById('auth-brand-icon').innerHTML = ICONS.lock;
regenerateCuotasFor('t31');
render();

// Todo lo de arriba corre igual que la maqueta (datos de ejemplo). Recién acá arranca
// Supabase: crea el cliente, engancha los listeners de auth/guardado automático, y revisa si
// ya había una sesión abierta -- ver la nota larga junto a initSupabaseAuth() en supabase.ts.
initSupabaseAuth();
