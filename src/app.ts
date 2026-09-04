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
function setAppHeight(){
  // visualViewport.height (when available) shrinks when the iOS keyboard opens, since it's the
  // ACTUALLY visible area -- window.innerHeight stays the same (the layout viewport doesn't
  // change size, the keyboard just covers part of it). Using window.innerHeight here made
  // .phone keep its full pre-keyboard height while the keyboard covered part of it, so a field
  // near the bottom of the current view could end up hidden under the keyboard with nowhere to
  // scroll it into (the browser's native "scroll the focused field into view" has no visible
  // room to work with, since .phone itself doesn't know it needs to shrink). Following
  // visualViewport's height instead makes .phone match what's actually visible on screen.
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', h + 'px');
}
setAppHeight();
// The "leftover strip of space until the app repaints" from the note above happens because on
// the very first paint of a freshly-opened PWA, window.innerHeight sometimes hasn't settled
// into the real full screen height yet -- it corrects itself a moment later, but if nothing in
// that session ever fires the events below (resize, switching tabs, etc.), that first wrong
// value stays stuck. These two short retries (50ms and 300ms; if it hasn't settled by 300ms it
// won't on its own) cover that gap without depending on the user doing anything.
setTimeout(setAppHeight, 50);
setTimeout(setAppHeight, 300);
['resize','orientationchange','pageshow','visibilitychange'].forEach(function(ev){
  window.addEventListener(ev, setAppHeight);
});
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', setAppHeight);
}

document.getElementById('fab-add').innerHTML = ICONS.plus;
document.getElementById('auth-brand-icon').innerHTML = ICONS.lock;
regenerateInstallmentsFor('t31');
render();

// Everything above runs the same as the mockup (sample data). Only here does Supabase start:
// it creates the client, hooks up the auth/auto-save listeners, and checks whether there was
// already an open session -- see the long note next to initSupabaseAuth() in supabase.ts.
initSupabaseAuth();
