import { ICONS } from './icons';
import { renderSheet } from './sheet';
import { state } from './state';
import { renderTabbar } from './ui/tabbar';
import { renderGroupsView } from './views/grupos';
import { renderSummaryView } from './views/inversiones';
import { renderMenuView } from './views/menu';
import { renderTransactionsView } from './views/transacciones';
/* ===================== MAIN RENDER ===================== */
export function render(){
  renderTabbar();
  if(state.tab==='transacciones') renderTransactionsView();
  else if(state.tab==='resumen') renderSummaryView();
  else if(state.tab==='grupos') renderGroupsView();
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
