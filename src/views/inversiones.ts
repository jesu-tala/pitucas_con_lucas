import { PLAZO_META, catInfo, montoAgregadoTx, plazoChip } from '../helpers';
import { ICONS, catIconMarkup } from '../icons';
import { segmentedHtml } from '../sheet';
import { CATS, DIAS_UMBRAL_ACTUALIZACION, METAS_INVERSION, MONTHS, MONTH_LABEL, PLANIFICADOR, PLATAFORMA_DATA, TX, computeDefaultPlanBase, money, moneyPlain, moneyPlainMasked, moneyShort, monthAbbr, state, todayISO } from '../state';
import { metaInversionMensualCLP, metaInversionPct } from '../ui/donut';
import { metaProgresoTotal, metasForPlataforma, platformMetasResumen, proyeccionAportes, renderEvolucionView, renderMetaEditForm, renderMetaGoalCard, renderMetaTotalChecksGrid } from './evolucion';
import { CAT_COLOR_CHOICES, CAT_ICON_CHOICES, catEnUso } from './menu';
import { renderBalanceView, renderComingSoon, renderPresupuestoView } from './presupuesto';
/* ===================== INVERSIONES (Fase 4) ===================== */
export function platformIds(){
  return Object.keys(CATS).filter(k=>CATS[k].tipo==='inversion');
}
// "Cerrar" una plataforma (ej: cerraste tu cuenta en Buda) no borra su historial — tus
// transacciones pasadas de esa plataforma siguen intactas en Transacciones/Balance/
// Presupuesto/Evolución, tal como fueron. Solo deja de contar hacia adelante: desaparece
// de "Mis plataformas", del "Total invertido" y de la proyección a futuro.
export function isPlatformArchived(id){ return !!(PLATAFORMA_DATA[id] && PLATAFORMA_DATA[id].archivada); }
export function activePlatformIds(){ return platformIds().filter(id=>!isPlatformArchived(id)); }
export function archivedPlatformIds(){ return platformIds().filter(id=>isPlatformArchived(id)); }
export function platformAportadoNeto(id){
  let total = 0;
  TX.forEach(t=>{
    if(t.tipo!=='inversion') return;
    t.categorias.forEach(c=>{ if(c.cat===id) total += c.monto; });
  });
  return total;
}
export function platformValorMonths(id){
  return MONTHS.filter(m=> PLATAFORMA_DATA[id].valorHistorial[m]!=null);
}
export function platformValorActual(id){
  const months = platformValorMonths(id);
  return months.length ? PLATAFORMA_DATA[id].valorHistorial[months[months.length-1]] : 0;
}
export function platformDiasDesdeActualizacion(id){
  const hoy = new Date(todayISO()+'T00:00:00');
  const fecha = new Date(PLATAFORMA_DATA[id].fechaActualizacion+'T00:00:00');
  return Math.max(0, Math.round((hoy.getTime()-fecha.getTime())/86400000));
}
// El eje X del gráfico de inversiones siempre muestra el año calendario completo (enero a
// diciembre) del año de HOY -- no un rango que dependa de qué meses tengan datos. Así, cuando
// sea 2027, esto automáticamente devuelve los 12 meses de 2027 en vez de seguir mostrando 2026.
export function inversionesMonthsCalendarYear(){
  const year = todayISO().slice(0,4);
  const out = [];
  for(let m=1; m<=12; m++) out.push(year+'-'+String(m).padStart(2,'0'));
  return out;
}
// true si TODAS las plataformas activas ya tienen un valor guardado para ese mes -- se usa
// para decidir si el mes tiene "dato real" o si el gráfico debe dejar un hueco ahí (mes futuro
// que todavía no llega, o mes anterior a que existiera la plataforma).
export function mesTieneValorParaTodas(monthKey){
  const ids = activePlatformIds();
  return ids.length>0 && ids.every(id=>PLATAFORMA_DATA[id].valorHistorial[monthKey]!=null);
}
// Aportado acumulado hasta ese mes (inclusive), sumando TODA la historia de transacciones de
// inversión hasta esa fecha (no solo un rango fijo de meses) -- o null si ese mes no tiene dato
// de valor para todas las plataformas, para que el gráfico deje un hueco en vez de un $0 falso.
export function aportadoAcumuladoHastaMesONull(monthKey){
  if(!mesTieneValorParaTodas(monthKey)) return null;
  let total = 0;
  TX.forEach(t=>{
    if(t.tipo!=='inversion' || t.estado==='no_es_gasto') return;
    if(t.fecha.slice(0,7) <= monthKey) total += montoAgregadoTx(t);
  });
  return total;
}
export function valorTotalEnMesONull(monthKey){
  if(!mesTieneValorParaTodas(monthKey)) return null;
  return activePlatformIds().reduce((s,id)=> s + (PLATAFORMA_DATA[id].valorHistorial[monthKey]||0), 0);
}

// Gráfico de líneas "aportado vs. valor". Eje X: 12 posiciones fijas (enero-diciembre), tengan
// o no dato ese mes -- si una serie no tiene dato en un mes (null), esa serie simplemente deja
// un hueco ahí en vez de inventar un valor (por eso se corta en tramos, no una sola ruta).
// Eje Y: 3 etiquetas aproximadas (arriba/medio/abajo), con formato abreviado.
export function buildDualLineChart(months, seriesA, seriesB, colorA, colorB){
  const W=320, H=180, padL=38, padR=8, padTop=16, padBottom=24;
  const plotW = W-padL-padR, plotH = H-padTop-padBottom;
  const valoresReales = seriesA.concat(seriesB).filter(v=>v!=null);
  const maxV = valoresReales.length ? Math.max(...valoresReales,0) : 1;
  const minV = valoresReales.length ? Math.min(...valoresReales,0) : 0;
  const range = (maxV-minV) || 1;
  const stepX = plotW/((months.length-1)||1);
  function xAt(i){ return padL+i*stepX; }
  function yAt(v){ return padTop+(1-(v-minV)/range)*plotH; }

  function segmentos(vals){
    const segs=[]; let actual=[];
    vals.forEach((v,i)=>{
      if(v==null){ if(actual.length) segs.push(actual); actual=[]; return; }
      actual.push([xAt(i), yAt(v)]);
    });
    if(actual.length) segs.push(actual);
    return segs;
  }
  function pathsFor(segs, extraAttrs){
    return segs.map(seg=>
      '<path d="'+seg.map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ')+'" '+extraAttrs+'/>'
    ).join('');
  }
  const segsA = segmentos(seriesA), segsB = segmentos(seriesB);
  const linesA = pathsFor(segsA, 'fill="none" stroke="'+colorA+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"');
  const linesB = pathsFor(segsB, 'fill="none" stroke="'+colorB+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 4"');
  const dotsA = segsA.flat().map(p=>'<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3" fill="'+colorA+'"/>').join('');
  const dotsB = segsB.flat().map(p=>'<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3" fill="'+colorB+'" stroke="var(--surface)" stroke-width="1"/>').join('');

  const labelsX = months.map((m,i)=>
    '<text x="'+xAt(i).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" font-size="9" fill="var(--text-tertiary)">'+monthAbbr(parseInt(m.slice(5,7),10))+'</text>'
  ).join('');

  const yTicks = [maxV, (maxV+minV)/2, minV];
  const gridY = yTicks.map(v=>{
    const y = yAt(v);
    return '<line x1="'+padL+'" y1="'+y.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+y.toFixed(1)+'" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3"/>'+
      '<text x="'+(padL-6)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end" font-size="9" fill="var(--text-tertiary)">'+moneyShort(v)+'</text>';
  }).join('');

  function ultimoPunto(vals){
    for(let i=vals.length-1;i>=0;i--){ if(vals[i]!=null) return [xAt(i), yAt(vals[i]), vals[i]]; }
    return null;
  }
  const lastA = ultimoPunto(seriesA), lastB = ultimoPunto(seriesB);
  let labelsFin = '';
  if(lastA && lastB){
    // separa las etiquetas finales si los dos valores terminan muy cerca (para que no se encimen)
    let yA = lastA[1]-8, yB = lastB[1]-8;
    const minGap = 13;
    if(Math.abs(yA-yB) < minGap){
      const mid = (yA+yB)/2;
      if(yA<=yB){ yA = mid-minGap/2; yB = mid+minGap/2; } else { yA = mid+minGap/2; yB = mid-minGap/2; }
    }
    labelsFin =
      '<text x="'+lastA[0].toFixed(1)+'" y="'+Math.max(10,yA).toFixed(1)+'" text-anchor="end" font-size="10" font-weight="700" fill="'+colorA+'">'+moneyPlainMasked(lastA[2])+'</text>'+
      '<text x="'+lastB[0].toFixed(1)+'" y="'+Math.max(10,yB).toFixed(1)+'" text-anchor="end" font-size="10" font-weight="700" fill="'+colorB+'">'+moneyPlainMasked(lastB[2])+'</text>';
  } else if(lastA){
    labelsFin = '<text x="'+lastA[0].toFixed(1)+'" y="'+Math.max(10,lastA[1]-8).toFixed(1)+'" text-anchor="end" font-size="10" font-weight="700" fill="'+colorA+'">'+moneyPlainMasked(lastA[2])+'</text>';
  } else if(lastB){
    labelsFin = '<text x="'+lastB[0].toFixed(1)+'" y="'+Math.max(10,lastB[1]-8).toFixed(1)+'" text-anchor="end" font-size="10" font-weight="700" fill="'+colorB+'">'+moneyPlainMasked(lastB[2])+'</text>';
  }

  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="display:block;overflow:visible;">'+
    gridY+linesA+linesB+dotsA+dotsB+labelsX+labelsFin+
  '</svg>';
}

export function renderPlatformEditForm(id){
  const cat = catInfo(id);
  const d = state.platformDraft;
  return '<div class="card platform-card editing">'+
    '<div class="platform-head">'+
      '<span class="platform-icon" style="--fill:var(--cat-'+cat.color+'-fill);--ink:var(--cat-'+cat.color+'-ink)">'+catIconMarkup(cat.icon)+'</span>'+
      '<span class="platform-name">'+cat.nombre+'</span>'+
    '</div>'+
    '<label class="draft-label">Valor actual aproximado</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-platform-field="valor" value="'+d.valor+'" placeholder="0">'+
    '<label class="draft-label" style="margin-top:12px;">Crecimiento anual estimado (opcional)</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-platform-field="tasaAnual" value="'+d.tasaAnual+'" placeholder="Sin estimar, ej: 6">'+
    '<div class="platform-hint muted">Escríbelo solo si quieres que el valor "crezca" solo entre actualizaciones — la app no te sugiere ningún número. Déjalo vacío para que se mueva solo con tus aportes y retiros.</div>'+
    // La comisión ahora vive en cada meta (depende del fondo/inversión específica) — acá
    // solo se ofrece cuando la plataforma todavía no tiene ninguna meta propia.
    (metasForPlataforma(id).length===0 ?
      '<label class="draft-label" style="margin-top:12px;">Comisión anual / TAC (opcional)</label>'+
      '<input type="text" inputmode="decimal" class="draft-input tabular" data-platform-field="comision" value="'+d.comision+'" placeholder="Ej: 1.1">'+
      '<div class="platform-hint muted">El % que te cobra esta plataforma al año (TAC, comisión de administración, etc.) — ponlo tú, la app no te sugiere ningún número. Se calcula sobre tu ganancia, no sobre el total de la cuenta. Si más adelante le agregas metas, la comisión se define por cada una, ya que puede variar por fondo.</div>'
    : '')+
    '<label class="draft-label" style="margin-top:12px;">Plazo de esta plataforma (opcional)</label>'+
    segmentedHtml('platform-plazo', [{id:'corto',label:'Corto'},{id:'medio',label:'Medio'},{id:'largo',label:'Largo'}], d.plazo, false)+
    '<div class="platform-hint muted">Solo si esta plataforma no tiene metas propias con su plazo ya definido.</div>'+
    '<div style="display:flex;gap:10px;margin-top:14px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-platform-edit>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-save-platform="'+id+'">Guardar</button>'+
    '</div>'+
    platformDeleteBlock(id)+
  '</div>';
}

// Si la plataforma nunca tuvo movimientos ni metas, se puede borrar de verdad (ej: la
// creaste sin querer). Si ya tiene historial, "eliminar" borraría transacciones reales —
// en vez de eso se ofrece "cerrar" (como cerrar una cuenta): deja de contar hacia adelante
// pero conserva intacto todo lo que ya pasó. Con metas activas, hay que borrarlas primero
// en cualquiera de los dos casos, para no dejarlas apuntando a una plataforma fantasma.
export function platformDeleteBlock(id){
  const enUso = catEnUso(id);
  const tieneMetas = metasForPlataforma(id).length>0;
  if(tieneMetas){
    return '<div class="file-format-hint">No se puede cerrar ni eliminar: tiene metas asociadas. Elimínalas primero.</div>';
  }
  if(!enUso){
    // Eliminar de verdad no tiene vuelta atrás (a diferencia de "cerrar", que se puede
    // reabrir) — por eso pide confirmar antes de borrarla y su categoría de Menú.
    if(state.confirmDeletePlatformId===id){
      return '<div class="file-format-hint" style="margin-bottom:8px;">¿Eliminar esta plataforma? No se puede deshacer, y también desaparece de Menú &gt; Categorías.</div>'+
        '<div style="display:flex;gap:10px;">'+
          '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-delete-platform>Cancelar</button>'+
          '<button class="save-tx-btn" style="flex:1;background:var(--expense-ink);" data-confirm-delete-platform="'+id+'">Sí, eliminar</button>'+
        '</div>';
    }
    return '<button class="budget-delete-link" style="margin-top:10px;" data-delete-platform="'+id+'">Eliminar plataforma</button>';
  }
  if(state.confirmArchivePlatformId===id){
    return '<div class="file-format-hint" style="margin-bottom:8px;">¿Cerrar esta plataforma? Deja de contar en "Mis plataformas", en el total invertido y en Menú &gt; Categorías — tus transacciones pasadas no se tocan, y puedes reabrirla cuando quieras.</div>'+
      '<div style="display:flex;gap:10px;">'+
        '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-archive-platform>Cancelar</button>'+
        '<button class="save-tx-btn" style="flex:1;" data-confirm-archive-platform="'+id+'">Sí, cerrar</button>'+
      '</div>';
  }
  return '<button class="budget-delete-link" style="margin-top:10px;" data-archive-platform="'+id+'">Cerrar plataforma</button>'+
    '<div class="platform-hint muted">Deja de contar en "Mis plataformas" y en el total invertido — tus transacciones pasadas no se tocan.</div>';
}

// Crea una plataforma de inversión nueva (ej: "Banco Santander") — hasta ahora las categorías
// de tipo inversión solo podían nacer si ya existían en la data semilla; esto le da a la
// usuaria una forma real de agregar una plataforma que todavía no tiene.
export function renderNewPlatformForm(){
  const d = state.newPlatformDraft;
  return '<div class="card platform-card editing">'+
    '<div class="platform-head"><span class="platform-name">Nueva plataforma</span></div>'+
    '<label class="draft-label">Nombre</label>'+
    '<input type="text" class="draft-input" data-newplatform-field="nombre" value="'+d.nombre+'" placeholder="Ej: Banco Santander">'+
    '<label class="draft-label" style="margin-top:12px;">Ícono</label>'+
    '<div class="icon-picker">'+CAT_ICON_CHOICES.map(ic=>'<button type="button" data-newplatform-icon="'+ic+'" class="'+(d.icon===ic?'active':'')+'">'+ICONS[ic]+'</button>').join('')+'</div>'+
    '<label class="draft-label" style="margin-top:12px;">Color</label>'+
    '<div class="color-picker">'+CAT_COLOR_CHOICES.map(c=>'<button type="button" data-newplatform-color="'+c+'" class="'+(d.color===c?'active':'')+'" style="--sw:var(--cat-'+c+'-fill)"></button>').join('')+'</div>'+
    '<label class="draft-label" style="margin-top:12px;">Valor actual aproximado</label>'+
    '<input type="text" inputmode="decimal" class="draft-input tabular" data-newplatform-field="valor" value="'+d.valor+'" placeholder="0">'+
    '<div class="platform-hint muted">Si ya tienes plata en esta plataforma, pon cuánto vale hoy — si acabas de abrirla, déjalo en 0.</div>'+
    '<label class="draft-label" style="margin-top:12px;">Plazo (opcional)</label>'+
    segmentedHtml('newplatform-plazo', [{id:'corto',label:'Corto'},{id:'medio',label:'Medio'},{id:'largo',label:'Largo'}], d.plazo, false)+
    '<div style="display:flex;gap:10px;margin-top:14px;">'+
      '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-newplatform>Cancelar</button>'+
      '<button class="save-tx-btn" style="flex:1;" data-save-newplatform>Guardar</button>'+
    '</div>'+
  '</div>';
}

// Antes cada plataforma se veía siempre desplegada por completo (valor, comisión, mini
// gráfico mes a mes, y sus metas, todo junto y siempre a la vista) — mucho espacio para
// revisar varias plataformas de un vistazo. Ahora es un acordeón: colapsada solo muestra
// nombre + hace cuánto se actualizó + el total + una flecha; tocarla despliega el resto
// (comisión, botones, y sus metas) debajo. Se sacó también el mini gráfico por plataforma
// (quedaba redundante con el gráfico general de "Aportado vs. valor" más abajo) y se
// renombró "Valor estimado" a algo que se entienda directo como el total de esa plataforma.
export function renderPlatformGroup(id){
  if(state.editingPlatformId===id) return '<div class="platform-group">'+renderPlatformEditForm(id)+'</div>';

  const cat = catInfo(id);
  const valorActual = platformValorActual(id);
  const aportado = platformAportadoNeto(id);
  const diff = valorActual - aportado;
  const dias = platformDiasDesdeActualizacion(id);
  const stale = dias > DIAS_UMBRAL_ACTUALIZACION;
  const tieneMetas = metasForPlataforma(id).length>0;
  const comision = PLATAFORMA_DATA[id].comision;
  // La comisión se cobra sobre la ganancia (total en la plataforma − aportado neto), nunca
  // sobre el total de la cuenta — si no hay ganancia todavía, la comisión estimada es $0.
  const ganancia = Math.max(0, diff);
  const comisionRow = (comision!=null && !tieneMetas) ? (
    '<div class="platform-comision-row">'+
      '<span>Comisión anual: <b class="tabular">'+comision+'%</b></span>'+
      '<span class="muted tabular">≈ '+money(ganancia*comision/100)+'/año sobre tu ganancia</span>'+
    '</div>'
  ) : '';
  const open = state.platformAbierta===id;

  const header =
    '<button class="platform-head-toggle" data-toggle-platform="'+id+'" aria-expanded="'+(open?'true':'false')+'">'+
      '<span class="platform-icon" style="--fill:var(--cat-'+cat.color+'-fill);--ink:var(--cat-'+cat.color+'-ink)">'+catIconMarkup(cat.icon)+'</span>'+
      '<span class="platform-head-body">'+
        '<span class="platform-name">'+cat.nombre+'</span>'+
        '<span class="platform-update-tag'+(stale?' stale':'')+'">Actualizado hace '+dias+' '+(dias===1?'día':'días')+'</span>'+
      '</span>'+
      '<span class="platform-head-value tabular">'+money(valorActual)+'</span>'+
      '<span class="platform-chev'+(open?' open':'')+'">'+ICONS.chevR+'</span>'+
    '</button>';

  if(!open) return '<div class="card platform-group">'+header+'</div>';

  const {metas, totalObjetivo, totalAcumulado, rachaCombinada} = platformMetasResumen(id);
  const addingHere = state.editingMetaId==='nueva' && state.addMetaPlataformaId===id;
  const combinedPct = totalObjetivo>0 ? (totalAcumulado/totalObjetivo)*100 : 0;
  const combinedSummary = metas.length>0 ? (
    '<div class="platform-meta-summary">'+
      '<div class="platform-meta-summary-head">'+
        '<span>Tus metas en '+cat.nombre+'</span>'+
        (rachaCombinada>0 ? '<span class="meta-racha-badge">'+rachaCombinada+' 🔥</span>' : '')+
      '</div>'+
      '<div class="platform-meta-summary-figs tabular">'+money(totalAcumulado)+'<span class="of-text"> de '+money(totalObjetivo)+'</span><span class="budget-pct tabular">'+Math.round(combinedPct)+'%</span></div>'+
      '<div class="budget-track"><div class="budget-fill" style="width:'+Math.max(0,Math.min(100,combinedPct))+'%;background:var(--accent);"></div></div>'+
    '</div>'
  ) : '';
  const metasBody = combinedSummary + metas.map(renderMetaGoalCard).join('') +
    (addingHere
      ? renderMetaEditForm(null, id)
      : '<button class="budget-add-link platform-add-meta-link" data-add-meta="'+id+'">+ Agregar meta a '+cat.nombre+'</button>');

  const body =
    '<div class="platform-body">'+
      '<div class="platform-figs">'+
        '<div class="platform-fig"><span class="platform-fig-label">Total en esta plataforma</span><span class="platform-fig-value tabular">'+money(valorActual)+'</span></div>'+
        '<div class="platform-fig"><span class="platform-fig-label">Aportado neto</span><span class="platform-fig-value tabular muted">'+money(aportado)+'</span></div>'+
      '</div>'+
      '<div class="platform-diff-row">'+
        '<span class="platform-diff '+(diff>=0?'pos':'neg')+'">'+(diff>=0?'+':'−')+money(Math.abs(diff))+' aprox.</span>'+
        // El chip de plazo solo se muestra si todavía no tiene metas propias — en cuanto
        // agregas una meta, su plazo manda y este queda de más.
        (!tieneMetas ? plazoChip(PLATAFORMA_DATA[id].plazo) : '')+
      '</div>'+
      comisionRow+
      '<div class="platform-actions-row">'+
        '<button class="budget-ver-mas" data-platform-vermas="'+id+'">Ver transacciones →</button>'+
        '<button class="budget-edit-btn" data-edit-platform="'+id+'" aria-label="Actualizar valor de '+cat.nombre+'">'+ICONS.edit+'</button>'+
      '</div>'+
      '<div class="platform-goal-nest">'+metasBody+'</div>'+
    '</div>';

  return '<div class="card platform-group open">'+header+body+'</div>';
}

// Plataformas cerradas: no cuentan en "Mis plataformas" ni en el total, pero su historial
// de transacciones sigue intacto — este bloque solo existe para poder reabrirlas si te
// equivocaste, o para recordar que existieron.
export function renderArchivedPlatformsBlock(){
  const ids = archivedPlatformIds();
  if(!ids.length) return '';
  return '<div class="section-title" style="margin-top:18px;">Plataformas cerradas</div>'+
    ids.map(id=>{
      const cat = catInfo(id);
      return '<div class="card platform-card archived-card">'+
        '<div class="platform-head">'+
          '<span class="platform-icon" style="--fill:var(--surface-sunken);--ink:var(--text-tertiary)">'+catIconMarkup(cat.icon)+'</span>'+
          '<span class="platform-name muted">'+cat.nombre+'</span>'+
          '<button class="budget-edit-btn" data-reopen-platform="'+id+'" aria-label="Reabrir '+cat.nombre+'">'+ICONS.repeat+'</button>'+
        '</div>'+
        '<button class="budget-ver-mas" data-platform-vermas="'+id+'">Ver transacciones →</button>'+
      '</div>';
    }).join('');
}

/* ---------- planificador de sueldo ---------- */
export function round1(n){ return Math.round(n*10)/10; }

export function metasPorPlazo(plazo){
  return METAS_INVERSION.filter(m=>(m.plazo||null)===plazo);
}
export function planMetaRowHtml(meta){
  const pct = PLANIFICADOR.metaPcts[meta.id] || 0;
  return '<div class="plan-row">'+
    '<div class="plan-name">'+meta.nombre+'<small>Meta de aporte: '+money(meta.aporteMensualMeta)+'/mes</small></div>'+
    '<div class="plan-pctbox"><input type="text" inputmode="decimal" data-plan-meta-pct data-plan-meta-id="'+meta.id+'" value="'+pct+'"><span>%</span></div>'+
    '<div class="plan-amt tabular" data-plan-meta-amt="'+meta.id+'"></div>'+
  '</div>';
}
export function planGroupBlock(plazoKey){
  const info = PLAZO_META[plazoKey];
  const metas = metasPorPlazo(plazoKey);
  const rows = metas.length
    ? metas.map(planMetaRowHtml).join('')
    : '<div class="plan-empty-hint muted">Sin metas de plazo '+info.label.toLowerCase()+' todavía — agrégalas en Inversiones.</div>';
  return '<div class="card plan-block">'+
    '<div class="plan-block-head" style="color:var(--cat-'+info.color+'-ink);"><span class="tag" style="background:var(--cat-'+info.color+'-fill);"></span>'+info.label+' plazo</div>'+
    rows+
    (metas.length ? '<div class="plan-subtotal" style="color:var(--cat-'+info.color+'-ink);"><span>Subtotal '+info.label.toLowerCase()+' · <span data-plan-group-pct="'+plazoKey+'"></span>%</span><span class="plan-subtotal-amt tabular" data-plan-group-amt="'+plazoKey+'"></span></div>' : '')+
  '</div>';
}

export function renderPlanificadorSection(){
  const P = PLANIFICADOR;
  const defaultBase = computeDefaultPlanBase();
  const mesActualLabel = MONTH_LABEL[todayISO().slice(0,7)] || '';

  return '<div class="section-title">Planificador de sueldo</div>'+
    '<div class="card plan-base-card">'+
      '<div class="plan-base-input-row">'+
        '<div class="plan-base-field">'+
          '<label class="draft-label">Total mensual a repartir</label>'+
          '<div class="plan-base-input"><span>$</span><input type="text" inputmode="numeric" data-plan-base-input value="'+moneyPlain(P.base)+'"></div>'+
        '</div>'+
        '<div style="flex-shrink:0;">'+
          '<span class="plan-total-pill" data-plan-total-pill><span class="dot"></span><span data-plan-total-txt></span></span>'+
          '<div class="plan-unassigned" data-plan-unassigned></div>'+
        '</div>'+
      '</div>'+
      '<div class="plan-base-hint muted">Sugerido: ingresos − gastos de '+mesActualLabel+' = '+money(defaultBase)+'. Edítalo si tu excedente real es otro.</div>'+
    '</div>'+
    '<div class="plan-bar" data-plan-bar></div>'+
    '<div class="plan-legend" data-plan-legend></div>'+
    '<div class="plan-cols">'+
      planGroupBlock('corto')+
      planGroupBlock('medio')+
      planGroupBlock('largo')+
    '</div>';
}

// Recalcula solo los números de la card de proyección al vivo, sin re-renderizar todo
// (así los inputs de % de retorno/inflación no pierden el foco mientras se escribe).
export function updateProyeccionCompute(){
  const proy = proyeccionAportes(3, 20);
  const totalEl = document.querySelector('[data-proy-total]');
  if(totalEl) totalEl.textContent = money(proy.proyectadoConRetorno);
}

export function updatePlanCompute(){
  const P = PLANIFICADOR;
  const base = P.base;
  const groupPct = {corto:0, medio:0, largo:0};

  ['corto','medio','largo'].forEach(plazoKey=>{
    metasPorPlazo(plazoKey).forEach(meta=>{
      const pct = P.metaPcts[meta.id] || 0;
      groupPct[plazoKey] += pct;
      const el = document.querySelector('[data-plan-meta-amt="'+meta.id+'"]');
      if(el) el.textContent = money(base*pct/100);
    });
    const pctEl = document.querySelector('[data-plan-group-pct="'+plazoKey+'"]'); if(pctEl) pctEl.textContent = String(round1(groupPct[plazoKey]));
    const amtEl = document.querySelector('[data-plan-group-amt="'+plazoKey+'"]'); if(amtEl) amtEl.textContent = money(base*groupPct[plazoKey]/100);
  });

  const total = groupPct.corto + groupPct.medio + groupPct.largo;
  const pillEl = document.querySelector('[data-plan-total-pill]');
  const txtEl = document.querySelector('[data-plan-total-txt]');
  const unEl = document.querySelector('[data-plan-unassigned]');
  const diff = 100-total;
  if(pillEl && txtEl && unEl){
    if(Math.abs(diff)<0.05){
      pillEl.classList.remove('warn'); txtEl.textContent = '100% asignado'; unEl.textContent = '';
    } else if(diff>0){
      pillEl.classList.remove('warn'); txtEl.textContent = round1(total)+'% asignado';
      unEl.textContent = 'Sin asignar: '+money(base*diff/100)+' ('+round1(diff)+'%)';
    } else {
      pillEl.classList.add('warn'); txtEl.textContent = round1(total)+'% — te pasaste';
      unEl.textContent = 'Asignaste '+money(base*(-diff)/100)+' ('+round1(-diff)+'%) más de tu excedente';
    }
  }

  const barEl = document.querySelector('[data-plan-bar]');
  const legEl = document.querySelector('[data-plan-legend]');
  if(barEl && legEl){
    barEl.innerHTML=''; legEl.innerHTML='';
    const segs = [
      {pct:groupPct.corto, color:'var(--cat-sky-fill)'},
      {pct:groupPct.medio, color:'var(--cat-sage-fill)'},
      {pct:groupPct.largo, color:'var(--cat-lavender-fill)'}
    ];
    const denom = Math.max(total, 100);
    segs.forEach(s=>{
      if(s.pct<=0) return;
      const d = document.createElement('span');
      d.style.width = (s.pct/denom*100)+'%';
      d.style.background = s.color;
      barEl.appendChild(d);
    });
    [['var(--cat-sky-fill)','Corto'],['var(--cat-sage-fill)','Medio'],['var(--cat-lavender-fill)','Largo']].forEach(([c,l])=>{
      const s = document.createElement('span');
      s.innerHTML = '<i style="background:'+c+'"></i>'+l;
      legEl.appendChild(s);
    });
  }
}

export function renderInversionesView(){
  const ids = activePlatformIds();
  const totalValor = ids.reduce((s,id)=>s+platformValorActual(id),0);
  const totalAportado = ids.reduce((s,id)=>s+platformAportadoNeto(id),0);
  const totalDiff = totalValor - totalAportado;
  const invMonths = inversionesMonthsCalendarYear();
  const aportadoSerie = invMonths.map(aportadoAcumuladoHastaMesONull);
  const valorSerie = invMonths.map(valorTotalEnMesONull);

  const {totalObjetivo, totalAcumulado} = metaProgresoTotal();
  const metaPct = totalObjetivo>0 ? (totalAcumulado/totalObjetivo)*100 : 0;
  // Una sola card: el total invertido (aplica siempre, tengas o no metas) y, si tienes al
  // menos una meta con monto objetivo, el progreso hacia esas metas como bloque secundario
  // dentro de la misma card — antes eran dos cards separadas y no quedaba claro que "objetivo"
  // solo suma las plataformas con meta, mientras "total invertido" suma todo.
  const goalBlock = METAS_INVERSION.length ? (
    '<div class="platform-total-goal-block">'+
      '<div class="platform-total-label" style="color:var(--accent-ink);">Objetivo de inversión '+todayISO().slice(0,4)+' (todas tus metas)</div>'+
      '<div class="platform-total-value tabular" style="font-size:20px;">'+money(totalAcumulado)+'<span class="of-text"> de '+money(totalObjetivo)+'</span></div>'+
      '<div class="budget-track" style="margin-top:10px;"><div class="budget-fill" style="width:'+Math.max(0,Math.min(100,metaPct))+'%;background:var(--accent);"></div></div>'+
      '<div class="platform-total-sub"><span>'+Math.round(metaPct)+'% completado entre '+METAS_INVERSION.length+' '+(METAS_INVERSION.length===1?'meta':'metas')+'</span></div>'+
      // Detalle chico: cuánto es, en plata, "todas tus metas" sumadas por mes — y de paso deja
      // claro que ese mismo número es el que define tu % de meta de Inversión en Balance.
      '<div class="platform-total-sub" style="margin-top:2px;color:var(--text-tertiary);font-size:11.5px;">Aporte mensual objetivo: <b class="tabular">'+money(metaInversionMensualCLP())+'</b> · '+Math.round(metaInversionPct())+'% de tus ingresos</div>'+
      renderMetaTotalChecksGrid()+
    '</div>'
  ) : '';

  const proy = proyeccionAportes(3, 20);
  const proyeccionCard = proy.meses.length>=2 ? (
    '<div class="card proyeccion-card">'+
      '<div class="proyeccion-head"><span class="proyeccion-icon">'+ICONS.sparkle+'</span><span class="proyeccion-title">Simulador</span></div>'+
      '<div class="proyeccion-value tabular" data-proy-total>'+money(proy.proyectadoConRetorno)+'</div>'+
      '<div class="proyeccion-sub">en '+proy.anios+' años · pesos de hoy</div>'+
      '<div class="proyeccion-text">Aportando <input type="text" inputmode="numeric" class="proy-inline-input proy-aporte-input" data-proy-aporte-input placeholder="'+moneyPlain(Math.round(proy.promedioMensual))+'" value="'+(state.proySimulatedAporte!=null?moneyPlain(state.proySimulatedAporte):'')+'">/mes al '+
        '<input type="text" inputmode="decimal" class="proy-inline-input" data-proy-retorno-input value="'+proy.retornoAnual+'">% anual, −'+
        '<input type="text" inputmode="decimal" class="proy-inline-input" data-proy-inflacion-input value="'+proy.inflacionAnual+'">% inflación.</div>'+
      '<div class="proyeccion-caption">Promedio de tus últimas 3 inversiones mensuales: <b class="tabular">'+money(proy.promedioMensual)+'</b></div>'+
    '</div>'
  ) : '';

  const html =
    '<div class="card platform-total-card">'+
      '<div class="platform-total-label">Total invertido</div>'+
      '<div class="platform-total-value tabular">'+money(totalValor)+'</div>'+
      '<div class="stat-grid stat-grid-compact" style="margin-top:14px;margin-bottom:0;">'+
        '<div class="stat-tile stat-inversiones"><div class="stat-label">Aportado neto</div><div class="stat-value tabular">'+money(totalAportado)+'</div></div>'+
        '<div class="stat-tile '+(totalDiff>=0?'stat-ingresos':'stat-gastos')+'"><div class="stat-label">Ganancia/pérdida aprox.</div><div class="stat-value tabular">'+(totalDiff>=0?'+':'−')+money(Math.abs(totalDiff))+'</div></div>'+
      '</div>'+
      goalBlock+
    '</div>'+
    '<div class="section-title" style="margin-top:4px;">Mis plataformas</div>'+
    ids.map(renderPlatformGroup).join('')+
    (state.creatingPlatform ? renderNewPlatformForm() : '<button class="budget-add-link" data-add-platform style="margin:4px 0 2px;margin-bottom:16px;">+ Agregar nueva plataforma</button>')+
    renderArchivedPlatformsBlock()+

    '<div class="section-title">Aportado vs. valor mes a mes</div>'+
    '<div class="card evo-card">'+
      '<div class="evo-legend-row">'+
        '<span class="evo-legend-item"><span class="evo-line-sample" style="background:var(--invest-ink);"></span>Aportado</span>'+
        '<span class="evo-legend-item"><span class="evo-line-sample dashed" style="border-color:var(--accent);"></span>Valor estimado</span>'+
      '</div>'+
      buildDualLineChart(invMonths, aportadoSerie, valorSerie, 'var(--invest-ink)', 'var(--accent)')+
      '<div class="evo-caption muted">El valor es una aproximación manual: sube y baja solo cuando tú lo actualizas, o con tus aportes y retiros.</div>'+
    '</div>'+

    renderPlanificadorSection()+
    proyeccionCard+
    '<div class="plan-disclaimer">Herramienta de orden personal, no asesoría financiera formal. Para decisiones grandes, valídalo con una persona profesional licenciada.</div>'+
    '<div style="height:12px;"></div>';

  document.getElementById('resumen-content').innerHTML = html;
  updatePlanCompute();
}

export function renderResumenSubContent(){
  if(state.resumenSub==='balance') renderBalanceView();
  else if(state.resumenSub==='presupuesto') renderPresupuestoView();
  else if(state.resumenSub==='evolucion') renderEvolucionView();
  else if(state.resumenSub==='inversiones') renderInversionesView();
  else renderComingSoon(state.resumenSub);
}

export const SUBS_META = {
  balance:{label:'Balance'},
  presupuesto:{label:'Presupuesto'},
  evolucion:{label:'Evolución'},
  inversiones:{label:'Inversiones'}
};
// El cuerpo interno de la barra de sub-tabs, aparte, para poder repintar SOLO esto
// mientras se arrastra una pestaña (sin tocar #resumen-content ni perder el drag).
export function renderResumenSubtabsInner(){
  return state.resumenSubOrder.map(id=>
    '<button class="subtab '+(state.resumenSub===id?'active':'')+(state.subtabDragId===id?' dragging':'')+'" data-resumen-sub="'+id+'">'+SUBS_META[id].label+'</button>'
  ).join('');
}

export function renderResumenView(){
  document.getElementById('header-title').textContent = 'Resumen';
  const subHtml = '<div class="subtabs" id="resumen-subtabs">'+renderResumenSubtabsInner()+'</div>';
  document.getElementById('view-root').innerHTML = subHtml + '<div id="resumen-content"></div>';
  renderResumenSubContent();
}

