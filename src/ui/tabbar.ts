import { ICONS } from '../icons';
import { state } from '../state';
/* ===================== TABBAR ===================== */
export function renderTabbar(){
  const tabs = [
    {id:'transacciones', label:'Transacciones', icon:'transacciones'},
    {id:'resumen', label:'Resumen', icon:'resumen'},
    {id:'grupos', label:'Grupos', icon:'users'},
    {id:'menu', label:'Menú', icon:'menu'}
  ];
  document.getElementById('tabbar').innerHTML = tabs.map(t=>
    '<button class="tab '+(state.tab===t.id?'active':'')+'" data-tab="'+t.id+'">'+ICONS[t.icon]+'<span>'+t.label+'</span></button>'
  ).join('');
}

