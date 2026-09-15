/* ===================== ENTRY POINT =====================
   This file is the only thing rebuild.py points tsc/esbuild at -- see tsconfig.json and
   "include". It's no longer one giant IIFE: it imports every module under src/ (one per
   section/view, see DOCUMENTACION.md section 2) and, at the end, runs exactly the same
   startup code that used to run at the end of the original single-piece app.ts (register
   listeners, do the first render() with the sample data, and only afterward start
   Supabase/auth) -- order matters, that's why initSupabaseAuth() is called by hand here, after
   the first render(), instead of letting Supabase auto-run just from importing that module
   (see the note next to "export let sb" in supabase.ts). esbuild bundles all these modules
   into a single IIFE (--format=iife), so the final result is still the same self-contained
   script as always. */

import { ICONS } from './icons';
import './state';
import './helpers';
import { regenerateInstallmentsFor } from './shared-expenses';
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

/* ---------- real screen height in "added to home screen" mode (PWA standalone) ----------
   On iOS, when the app is added to the home screen (no browser chrome), sometimes the first
   paint uses a screen height that doesn't yet fully include the area under the status bar /
   above the "home indicator" — 100dvh and env(safe-area-inset-bottom) should resolve this on
   their own, but on some iPhones there's a leftover strip of empty space (the page's
   background color) below the bottom bar until the app repaints.
   We store the real height in a CSS variable and recompute it on any event that could change
   it, so .phone (which uses it as a fallback for 100dvh) always matches the real screen and
   never stays stuck on a stale measurement. */
// Earlier versions of this function ALWAYS computed --app-height from JS (window.innerHeight,
// later visualViewport.height) and set it unconditionally. That turned out to be the wrong
// default: a CSS custom property, once set, never falls back to the plain `100dvh` in .phone's
// rule again on its own -- so if our JS-measured value was ever a few pixels short of the real
// screen (which happened on some iPhones, for reasons out of our control: how exactly iOS
// reports window.innerHeight/visualViewport.height right after a PWA launches isn't fully
// consistent), that gap stayed stuck under the tab bar for the whole session. Modern iOS
// Safari's own `100dvh` calculation (the CSS fallback already in .phone's rule) handles the
// "dynamic viewport" case more reliably than we can by re-reading a JS height ourselves --
// that's specifically what `dvh` units exist to solve. So now this only steps in for the ONE
// case CSS truly can't handle by itself: the on-screen keyboard opening, which shrinks
// visualViewport.height without changing window.innerHeight (the "layout viewport" -- what
// 100dvh is based on -- doesn't shrink for the keyboard, it just gets covered by it). Outside
// of that, --app-height is left unset, so .phone's `height:var(--app-height, 100dvh)` uses
// 100dvh directly.
function clearAppHeight(){ document.documentElement.style.removeProperty('--app-height'); }
// Bug real reportado (segunda vuelta -- la primera ya sacó a .tabbar del flujo de .phone
// haciéndola position:fixed contra el viewport real, pero eso no arregla que .phone MISMO se
// dibuje más chico que la pantalla real, dejando un hueco entre su contenido y la barra):
// window.innerHeight y visualViewport.height en iOS no siempre están ya asentados en el
// primerísimo instante en que este script corre -- pueden diferir por más de unos pocos px sin
// que haya ningún teclado abierto (no puede haberlo: recién está cargando, nada tiene foco
// todavía). Con un margen de solo 40px, esa diferencia de arranque se leía como "el teclado está
// abierto" -- un falso positivo que dejaba --app-height pegado en un valor más chico que la
// pantalla real por el resto de la sesión, hasta el primer resize/orientation genuino (que sí
// recalcula con métricas ya asentadas, por eso "se arreglaba solo al mover el teléfono").
// Arreglo: al arrancar se asume DIRECTAMENTE que no hay teclado (es imposible que lo haya --
// ningún campo tiene foco todavía) en vez de intentar medirlo con métricas que pueden no estar
// asentadas; el único momento en que de verdad hace falta recalcular es cuando
// visualViewport.resize dispara por una razón real (el teclado se abre/cierra de verdad), con un
// margen bastante más generoso (150px -- un teclado real tapa varias veces eso) para no
// confundirlo con jitter normal del viewport.
function onViewportResize(){
  const vv = window.visualViewport;
  if(vv && vv.height < window.innerHeight - 150){
    document.documentElement.style.setProperty('--app-height', Math.round(vv.height) + 'px');
  } else {
    clearAppHeight();
  }
}
clearAppHeight();
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', onViewportResize);
  window.visualViewport.addEventListener('scroll', onViewportResize);
}
// orientationchange/pageshow/visibilitychange ya no vuelven a intentar "adivinar" si hay teclado
// abierto (esa adivinanza, con métricas recién asentándose, es exactamente la causa del bug de
// arriba) -- un teclado no puede seguir abierto después de rotar la pantalla o de que la app
// vuelva de segundo plano, así que estos simplemente vuelven al estado por defecto (100dvh
// nativo) y dejan que el próximo visualViewport.resize real, si corresponde, lo recalcule bien.
['orientationchange','pageshow','visibilitychange'].forEach(function(ev){
  window.addEventListener(ev, clearAppHeight);
});

document.getElementById('fab-add').innerHTML = ICONS.plus;
document.getElementById('auth-brand-icon').innerHTML = ICONS.lock;
document.getElementById('auth-recovery-brand-icon').innerHTML = ICONS.lock;
regenerateInstallmentsFor('t31');
render();

// Everything above runs the same as the mockup (sample data). Only here does Supabase start:
// it creates the client, hooks up the auth/auto-save listeners, and checks whether there was
// already an open session -- see the long note next to initSupabaseAuth() in supabase.ts.
initSupabaseAuth();
