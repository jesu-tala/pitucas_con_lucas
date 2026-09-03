import { ICONS } from './icons';
import { renderSheet } from './sheet';
import { state } from './state';
import { renderTabbar } from './ui/tabbar';
import { renderGruposView } from './views/grupos';
import { renderResumenView } from './views/inversiones';
import { renderMenuView } from './views/menu';
import { renderTransaccionesView } from './views/transacciones';
/* ===================== MAIN RENDER ===================== */
export function render(){
  renderTabbar();
  if(state.tab==='transacciones') renderTransaccionesView();
  else if(state.tab==='resumen') renderResumenView();
  else if(state.tab==='grupos') renderGruposView();
  else renderMenuView();
  const fab = document.getElementById('fab-add');
  if(fab) fab.hidden = state.tab!=='transacciones';
  const demoBanner = document.getElementById('demo-banner');
  if(demoBanner){
    demoBanner.hidden = !state.demoMode;
    if(state.demoMode) demoBanner.innerHTML = ICONS.lock+'<span>Demo</span>';
  }
  renderSheet();
}

