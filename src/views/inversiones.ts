import { GOAL_TERM, catInfo, aggregatedTxAmount, termChip } from '../helpers';
import { ICONS, catIconMarkup } from '../icons';
import { segmentedHtml } from '../sheet';
import { CATEGORIES, UPDATE_THRESHOLD_DAYS, INVESTMENT_GOALS, MONTHS, MONTH_LABEL, PLANNER, PLATFORM_DATA, TRANSACTIONS, computeDefaultPlanBase, money, moneyPlain, moneyPlainMasked, moneyShort, monthAbbr, state, todayISO } from '../state';
import { monthlyInvestmentGoalCLP, investmentGoalPct } from '../ui/donut';
import { annualInvestmentGoalProgress, goalsForPlatform, metaAportadoNeto, metaHistorialAt, platformGoalsSummary, projectedContributions, renderEvolutionView, renderGoalEditForm, renderGoalCard, renderTotalChecksGrid } from './evolucion';
import { CATEGORY_COLOR_CHOICES, CATEGORY_ICON_CHOICES, isCategoryInUse } from './menu';
import { renderBalanceView, renderComingSoon, renderBudgetView } from './presupuesto';
/* ===================== INVESTMENTS (Phase 4) ===================== */
export function platformIds(){
  return Object.keys(CATEGORIES).filter(k=>CATEGORIES[k].tipo==='inversion');
}
// "Closing" a platform (e.g. you closed your Buda account) does not erase its history — its
// past transactions stay intact in Transactions/Balance/Budget/Evolution exactly as they were.
// It just stops counting going forward: it disappears from "Mis plataformas", from "Total
// invertido" and from the future projection.
export function isPlatformArchived(id){ return !!(PLATFORM_DATA[id] && PLATFORM_DATA[id].archivada); }
export function activePlatformIds(){ return platformIds().filter(id=>!isPlatformArchived(id)); }
export function archivedPlatformIds(){ return platformIds().filter(id=>isPlatformArchived(id)); }
// Active platforms that CAN host a goal -- a sinValuacion platform (e.g. the seeded "Otros"
// catch-all) never can, by explicit design (it exists only for one-off contributions with no
// platform/goal of their own). Used anywhere the app needs to pick a sensible default platform
// for "create a new goal" (the empty state's button, the "no goals yet" fallback) so it never
// lands the user inside "Otros" trying to do something that screen won't let them finish.
export function goalCapablePlatformIds(){ return activePlatformIds().filter(id=>!PLATFORM_DATA[id].sinValuacion); }
// A transaction never categorizes straight to a platform id anymore (see the note on
// INVESTMENT_GOALS in state.ts) -- it points at one of the platform's Goals, or at this
// catch-all bucket, for a contribution that isn't for any specific goal. It still counts
// toward the platform's Aportado neto (see platformAportadoNeto below), just not toward any
// one goal's own progress.
export function generalCatIdFor(platformId){ return platformId+'__general'; }
export function platformGeneralAmount(platformId){
  const generalId = generalCatIdFor(platformId);
  let total = 0;
  TRANSACTIONS.forEach(t=>{
    if(t.tipo!=='inversion') return;
    t.categorias.forEach(c=>{ if(c.cat===generalId) total += c.monto; });
  });
  return total;
}
// Rollup, not a direct transaction sum: a platform's net contribution is whatever its own
// Goals have accumulated (metaAportadoNeto, itself computed from transactions) plus whatever
// landed in its General bucket. This is what lets requirement (4) hold -- categorizing to a
// Goal counts both toward that goal AND toward its platform's total, automatically, without
// double-entering anything.
export function platformAportadoNeto(id){
  return goalsForPlatform(id).reduce((s,m)=>s+metaAportadoNeto(m), 0) + platformGeneralAmount(id);
}
// Options offered when classifying an investment-type transaction: each active platform's
// Goals, plus its "General" catch-all (see platformGeneralAmount above). A closed platform's
// goals aren't offered for NEW classifications (isPlatformArchived), same as the platform
// itself already wasn't -- unless the currently selected value already belongs to it, so an
// old transaction pointing at a since-closed platform keeps showing its real category instead
// of silently losing it from the dropdown.
export function investmentCatOptions(selectedId?){
  const out: {value:string, label:string, plataformaId:string, icon:string}[] = [];
  platformIds().forEach(platId=>{
    const plat = CATEGORIES[platId];
    const generalId = generalCatIdFor(platId);
    const goals = goalsForPlatform(platId);
    const belongsHere = selectedId===generalId || goals.some(g=>g.id===selectedId);
    if(isPlatformArchived(platId) && !belongsHere) return;
    goals.forEach(g=> out.push({value:g.id, label:plat.nombre+' · '+g.nombre, plataformaId:platId, icon:plat.icon}));
    // A sinValuacion platform (e.g. "Otros") can never have goals of its own (see
    // goalCapablePlatformIds below) -- its General bucket is its ONLY option, so the
    // "· General" suffix would just be noise; every other platform keeps the suffix since it
    // exists specifically to tell it apart from that platform's own goals.
    const generalLabel = (goals.length===0 && PLATFORM_DATA[platId].sinValuacion) ? plat.nombre : plat.nombre+' · General';
    out.push({value:generalId, label:generalLabel, plataformaId:platId, icon:plat.icon});
  });
  return out;
}
export function platformValorMonths(id){
  return MONTHS.filter(m=> PLATFORM_DATA[id].valorHistorial[m]!=null);
}
export function platformCurrentValue(id){
  // A sinValuacion platform (e.g. the seeded "Otros" catch-all, see PLATFORM_DATA.otros in
  // state.ts) has no valuation of its own to track -- its "current value" is defined to be
  // exactly what's been contributed to it, so gain/loss (value − aportado) comes out to exactly
  // $0 by construction, everywhere that already computes gain that way (renderPlatformGroup,
  // metaGananciaEstimada, etc.) without any of them needing to know about sinValuacion at all.
  if(PLATFORM_DATA[id].sinValuacion) return platformAportadoNeto(id);
  const months = platformValorMonths(id);
  return months.length ? PLATFORM_DATA[id].valorHistorial[months[months.length-1]] : 0;
}
export function platformDiasDesdeActualizacion(id){
  const hoy = new Date(todayISO()+'T00:00:00');
  const fecha = new Date(PLATFORM_DATA[id].fechaActualizacion+'T00:00:00');
  return Math.max(0, Math.round((hoy.getTime()-fecha.getTime())/86400000));
}
// The investments chart's X axis always shows the full calendar year (January to December) of
// TODAY's year -- not a range that depends on which months have data. That way, once it's
// 2027, this automatically returns the 12 months of 2027 instead of still showing 2026.
export function inversionesMonthsCalendarYear(){
  const year = todayISO().slice(0,4);
  const out = [];
  for(let m=1; m<=12; m++) out.push(year+'-'+String(m).padStart(2,'0'));
  return out;
}
// true if ALL active platforms already have a stored value for that month -- used to decide
// whether the month has "real data" or whether the chart should leave a gap there (a future
// month that hasn't arrived yet, or a month before the platform existed). A sinValuacion
// platform (e.g. "Otros") never has a valorHistorial entry at all (there's nothing to type in by
// hand, see PLATFORM_DATA.otros in state.ts) -- it always counts as "has a value" for every
// month, since its value is always defined (whatever's been contributed through that month, $0
// if nothing yet), so its mere existence as an active platform can never gap out the whole chart.
export function mesTieneValorParaTodas(monthKey){
  const ids = activePlatformIds();
  return ids.length>0 && ids.every(id=>PLATFORM_DATA[id].sinValuacion || PLATFORM_DATA[id].valorHistorial[monthKey]!=null);
}
// Cumulative contributions up to that month (inclusive), summing ALL of the investment
// transaction history up to that date (not just a fixed range of months) -- or null if that
// month doesn't have a value for all platforms, so the chart leaves a gap instead of a false $0.
export function aportadoAcumuladoHastaMesONull(monthKey){
  if(!mesTieneValorParaTodas(monthKey)) return null;
  let total = 0;
  TRANSACTIONS.forEach(t=>{
    if(t.tipo!=='inversion' || t.estado==='no_es_gasto') return;
    if(t.fecha.slice(0,7) <= monthKey) total += aggregatedTxAmount(t);
  });
  return total;
}
// Same idea as platformGeneralAmount (above) but cut off at a given month, so the "value" curve
// of a sinValuacion platform (see below) can move month by month instead of only knowing its
// value as of right now.
export function platformGeneralAmountHastaMes(platformId, monthKey){
  const generalId = generalCatIdFor(platformId);
  let total = 0;
  TRANSACTIONS.forEach(t=>{
    if(t.tipo!=='inversion') return;
    if(t.fecha.slice(0,7) > monthKey) return;
    t.categorias.forEach(c=>{ if(c.cat===generalId) total += c.monto; });
  });
  return total;
}
// A sinValuacion platform's "value in month M" is defined to be its cumulative aportado THROUGH
// that month (same idea as platformAportadoNeto, just cut off at a month instead of always as-of-
// now) -- mirrors metaHistorialAt's pattern at the goal level, one level up at the platform.
// Only ever needed for a sinValuacion platform (see valorTotalEnMesONull below); harmless to call
// on any platform id, but a platform with real valuation has no use for it.
export function platformAportadoNetoHastaMes(id, monthKey){
  return goalsForPlatform(id).reduce((s,m)=>s+(metaHistorialAt(m, monthKey)||0), 0) + platformGeneralAmountHastaMes(id, monthKey);
}
export function valorTotalEnMesONull(monthKey){
  if(!mesTieneValorParaTodas(monthKey)) return null;
  return activePlatformIds().reduce((s,id)=>
    s + (PLATFORM_DATA[id].sinValuacion ? platformAportadoNetoHastaMes(id, monthKey) : (PLATFORM_DATA[id].valorHistorial[monthKey]||0))
  , 0);
}

// "Contributed vs. value" line chart. X axis: 12 fixed positions (January-December), whether
// or not there's data that month -- if a series has no data for a month (null), that series
// simply leaves a gap there instead of making up a value (that's why it's split into segments,
// not a single path). Y axis: 3 approximate labels (top/middle/bottom), abbreviated format.
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
    // push the end labels apart if the two values end up very close (so they don't overlap)
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
    // comision now lives on each goal (it depends on the specific fund/investment) — here
    // it's only offered when the platform doesn't yet have any goal of its own.
    (goalsForPlatform(id).length===0 ?
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

// If the platform never had any transactions or goals, it can be deleted for real (e.g. you
// created it by mistake). If it already has history, "deleting" would erase real transactions —
// instead it offers "closing" it (like closing an account): it stops counting going forward but
// keeps everything that already happened intact. With active goals, they have to be deleted
// first in either case, so they don't end up pointing at a ghost platform.
export function platformDeleteBlock(id){
  // A transaction never points at the bare platform id anymore (see generalCatIdFor above) --
  // "in use" now means it has General-bucket transactions (isCategoryInUse(id) is also checked,
  // defensively, in case any old-shape data with a bare platform id ever slips through).
  const enUso = isCategoryInUse(id) || isCategoryInUse(generalCatIdFor(id));
  const tieneMetas = goalsForPlatform(id).length>0;
  if(tieneMetas){
    return '<div class="file-format-hint">No se puede cerrar ni eliminar: tiene metas asociadas. Elimínalas primero.</div>';
  }
  if(!enUso){
    // Actually deleting has no way back (unlike "closing", which can be reopened) — that's
    // why it asks for confirmation before deleting it and its category in Menu.
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

// Creates a new investment platform (e.g. "Banco Santander") — until now, categories of type
// inversion could only come into being if they already existed in the seed data; this gives
// the user a real way to add a platform she doesn't already have.
export function renderNewPlatformForm(){
  const d = state.newPlatformDraft;
  return '<div class="card platform-card editing">'+
    '<div class="platform-head"><span class="platform-name">Nueva plataforma</span></div>'+
    '<label class="draft-label">Nombre</label>'+
    '<input type="text" class="draft-input" data-newplatform-field="nombre" value="'+d.nombre+'" placeholder="Ej: Banco Santander">'+
    '<label class="draft-label" style="margin-top:12px;">Ícono</label>'+
    '<div class="icon-picker">'+CATEGORY_ICON_CHOICES.map(ic=>'<button type="button" data-newplatform-icon="'+ic+'" class="'+(d.icon===ic?'active':'')+'">'+ICONS[ic]+'</button>').join('')+'</div>'+
    '<label class="draft-label" style="margin-top:12px;">Color</label>'+
    '<div class="color-picker">'+CATEGORY_COLOR_CHOICES.map(c=>'<button type="button" data-newplatform-color="'+c+'" class="'+(d.color===c?'active':'')+'" style="--sw:var(--cat-'+c+'-fill)"></button>').join('')+'</div>'+
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

// Previously each platform was always shown fully expanded (value, comision, month-by-month
// mini chart, and its goals, all together and always visible) — that took a lot of space to
// review several platforms at a glance. Now it's an accordion: collapsed it only shows the
// name + how long since it was updated + the total + an arrow; tapping it expands the rest
// (comision, buttons, and its goals) below. The per-platform mini chart was also removed
// (it was redundant with the general "Aportado vs. valor" chart further down) and "Valor
// estimado" was renamed to something that reads directly as that platform's total.
export function renderPlatformGroup(id){
  if(state.editingPlatformId===id) return '<div class="platform-group">'+renderPlatformEditForm(id)+'</div>';

  const cat = catInfo(id);
  const sinValuacion = !!PLATFORM_DATA[id].sinValuacion;
  const valorActual = platformCurrentValue(id);
  const aportado = platformAportadoNeto(id);
  const diff = valorActual - aportado;
  // A sinValuacion platform (e.g. "Otros") has no valuation to go stale -- there's nothing to
  // "update", so it never shows the "Actualizado hace N días" tag (platformDiasDesdeActualizacion
  // would otherwise choke trying to build a Date from a null fechaActualizacion).
  const dias = sinValuacion ? 0 : platformDiasDesdeActualizacion(id);
  const stale = !sinValuacion && dias > UPDATE_THRESHOLD_DAYS;
  const tieneMetas = goalsForPlatform(id).length>0;
  const comision = PLATFORM_DATA[id].comision;
  // comision is charged on the gain (total in the platform − net contributed), never on the
  // account's total — if there's no gain yet, the estimated comision is $0. A sinValuacion
  // platform's gain is always exactly $0 by construction (platformCurrentValue(id)===aportado),
  // and it's never given a comision anyway (state.ts seeds it null) -- !sinValuacion here is
  // just defensive, in case that ever changes.
  const ganancia = Math.max(0, diff);
  const comisionRow = (comision!=null && !tieneMetas && !sinValuacion) ? (
    '<div class="platform-comision-row">'+
      '<span>Comisión anual: <b class="tabular">'+comision+'%</b></span>'+
      '<span class="muted tabular">≈ '+money(ganancia*comision/100)+'/año sobre tu ganancia</span>'+
    '</div>'
  ) : '';
  const open = state.openPlatformId===id;

  const header =
    '<button class="platform-head-toggle" data-toggle-platform="'+id+'" aria-expanded="'+(open?'true':'false')+'">'+
      '<span class="platform-icon" style="--fill:var(--cat-'+cat.color+'-fill);--ink:var(--cat-'+cat.color+'-ink)">'+catIconMarkup(cat.icon)+'</span>'+
      '<span class="platform-head-body">'+
        '<span class="platform-name">'+cat.nombre+'</span>'+
        (sinValuacion ? '' : '<span class="platform-update-tag'+(stale?' stale':'')+'">Actualizado hace '+dias+' '+(dias===1?'día':'días')+'</span>')+
      '</span>'+
      // For a sinValuacion platform, "valorActual" IS the aportado (see platformCurrentValue) --
      // same number either way, so no extra branch is needed here, just a label choice further
      // down in the expanded body (platform-figs) where "Total en esta plataforma" would
      // otherwise misleadingly imply an independent valuation.
      '<span class="platform-head-value tabular">'+money(valorActual)+'</span>'+
      '<span class="platform-chev'+(open?' open':'')+'">'+ICONS.chevR+'</span>'+
    '</button>';

  if(!open) return '<div class="card platform-group">'+header+'</div>';

  const {metas, totalObjetivo, totalAcumulado, rachaCombinada} = platformGoalsSummary(id);
  const addingHere = state.editingGoalId==='nueva' && state.addGoalPlatformId===id;
  const combinedPct = totalObjetivo>0 ? (totalAcumulado/totalObjetivo)*100 : 0;
  // The combined stock summary only means something when at least one of this platform's goals
  // actually has a montoObjetivo -- otherwise it would show a meaningless "$X de $0 · 0%" for a
  // platform whose goals are all flow-only.
  const combinedSummary = (metas.length>0 && totalObjetivo>0) ? (
    '<div class="platform-meta-summary">'+
      '<div class="platform-meta-summary-head">'+
        '<span>Tus metas en '+cat.nombre+'</span>'+
        (rachaCombinada>0 ? '<span class="meta-racha-badge">'+rachaCombinada+' 🔥</span>' : '')+
      '</div>'+
      '<div class="platform-meta-summary-figs tabular">'+money(totalAcumulado)+'<span class="of-text"> de '+money(totalObjetivo)+'</span><span class="budget-pct tabular">'+Math.round(combinedPct)+'%</span></div>'+
      '<div class="budget-track"><div class="budget-fill" style="width:'+Math.max(0,Math.min(100,combinedPct))+'%;background:var(--accent);"></div></div>'+
    '</div>'
  ) : '';
  // A sinValuacion platform (e.g. "Otros") can never have goals of its own (see
  // goalCapablePlatformIds) -- no goals to list, no combined summary, and no "+ Agregar meta"
  // link (there's nowhere to add one to).
  const metasBody = sinValuacion ? '' : (
    combinedSummary + metas.map(renderGoalCard).join('') +
    (addingHere
      ? renderGoalEditForm(null, id)
      : '<button class="budget-add-link platform-add-meta-link" data-add-goal="'+id+'">+ Agregar meta a '+cat.nombre+'</button>')
  );

  const body =
    '<div class="platform-body">'+
      '<div class="platform-figs">'+
        '<div class="platform-fig"><span class="platform-fig-label">'+(sinValuacion?'Aportado':'Total en esta plataforma')+'</span><span class="platform-fig-value tabular">'+money(valorActual)+'</span></div>'+
        '<div class="platform-fig"><span class="platform-fig-label">Aportado neto</span><span class="platform-fig-value tabular muted">'+money(aportado)+'</span></div>'+
      '</div>'+
      // The plazo chip is only shown if it doesn't have its own goals yet — as soon as
      // you add a goal, its plazo takes over and this one becomes redundant.
      (!tieneMetas && !sinValuacion ? '<div class="platform-diff-row">'+termChip(PLATFORM_DATA[id].plazo)+'</div>' : '')+
      comisionRow+
      '<div class="platform-actions-row">'+
        '<button class="budget-ver-mas" data-platform-see-more="'+id+'">Ver transacciones →</button>'+
        // Nothing to update on a sinValuacion platform (no valuation, no comision of its own) --
        // no pencil button.
        (sinValuacion ? '' : '<button class="budget-edit-btn" data-edit-platform="'+id+'" aria-label="Actualizar valor de '+cat.nombre+'">'+ICONS.edit+'</button>')+
      '</div>'+
      '<div class="platform-goal-nest">'+metasBody+'</div>'+
    '</div>';

  return '<div class="card platform-group open">'+header+body+'</div>';
}

// Closed platforms: they don't count in "Mis plataformas" or in the total, but their
// transaction history stays intact — this block only exists so you can reopen them if you
// made a mistake, or to remember that they existed.
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
        '<button class="budget-ver-mas" data-platform-see-more="'+id+'">Ver transacciones →</button>'+
      '</div>';
    }).join('');
}

/* ---------- salary planner ---------- */
export function round1(n){ return Math.round(n*10)/10; }

export function metasPorPlazo(plazo){
  return INVESTMENT_GOALS.filter(m=>(m.plazo||null)===plazo);
}
export function planMetaRowHtml(meta){
  const pct = PLANNER.metaPcts[meta.id] || 0;
  return '<div class="plan-row">'+
    '<div class="plan-name">'+meta.nombre+'<small>Meta de aporte: '+money(meta.aporteMensualMeta)+'/mes</small></div>'+
    '<div class="plan-pctbox"><input type="text" inputmode="decimal" data-plan-goal-pct data-plan-goal-id="'+meta.id+'" value="'+pct+'"><span>%</span></div>'+
    '<div class="plan-amt tabular" data-plan-goal-amt="'+meta.id+'"></div>'+
  '</div>';
}
export function planGroupBlock(plazoKey){
  const info = GOAL_TERM[plazoKey];
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
  const P = PLANNER;
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

// Recomputes only the numbers on the projection card live, without re-rendering everything
// (that way the return % input doesn't lose focus while typing).
export function updateProyeccionCompute(){
  const proy = projectedContributions(3, 20);
  const totalEl = document.querySelector('[data-proj-total]');
  if(totalEl) totalEl.textContent = money(proy.proyectadoConRetorno);
}

export function updatePlanCompute(){
  const P = PLANNER;
  const base = P.base;
  const groupPct = {corto:0, medio:0, largo:0};

  ['corto','medio','largo'].forEach(plazoKey=>{
    metasPorPlazo(plazoKey).forEach(meta=>{
      const pct = P.metaPcts[meta.id] || 0;
      groupPct[plazoKey] += pct;
      const el = document.querySelector('[data-plan-goal-amt="'+meta.id+'"]');
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

export function renderInvestmentsView(){
  const ids = activePlatformIds();
  const totalValor = ids.reduce((s,id)=>s+platformCurrentValue(id),0);
  const totalAportado = ids.reduce((s,id)=>s+platformAportadoNeto(id),0);
  const invMonths = inversionesMonthsCalendarYear();
  const aportadoSerie = invMonths.map(aportadoAcumuladoHastaMesONull);
  const valorSerie = invMonths.map(valorTotalEnMesONull);

  // The "Objetivo de inversión [año]" card is a FLOW metric, not a stock one -- it used to
  // compare the STOCK total of every goal's montoObjetivo against the STOCK lifetime accumulated
  // total, mislabeled as if it were annual (see annualInvestmentGoalProgress in evolucion.ts for
  // the full reasoning). Now: objetivoAnual is what you actually committed to invest this year
  // (fixed aporteMensualMeta × 12, summed over goals that have one); aporteAnio is what you
  // actually put into those SAME fixed-aporte goals so far this year -- the only thing that can
  // move this bar. otrosAporteAnio (flow-only goals, General buckets, "Otros") is real investment
  // too, just never allowed to push this specific bar past 100%, so it's shown as a separate
  // informational line instead.
  const anio = todayISO().slice(0,4);
  const {objetivoAnual, aporteAnio, otrosAporteAnio} = annualInvestmentGoalProgress(anio);
  const anualPct = objetivoAnual>0 ? (aporteAnio/objetivoAnual)*100 : 0;
  const otrosAporteLine = otrosAporteAnio>0
    ? '<div class="platform-total-sub" style="margin-top:2px;">+ '+money(otrosAporteAnio)+' en aportes sin objetivo fijo este año</div>'
    : '';
  // A single card: the total invested (always applies, whether or not you have goals) and, if
  // you have at least one goal with a montoObjetivo, the progress toward those goals as a
  // secondary block inside the same card — previously these were two separate cards and it
  // wasn't clear that "objetivo" only adds up the platforms with a goal, while "total invertido"
  // adds up everything.
  const goalBlock = !INVESTMENT_GOALS.length ? '' : (objetivoAnual>0 ? (
    '<div class="platform-total-goal-block">'+
      '<div class="platform-total-label" style="color:var(--accent-ink);">Objetivo de inversión '+anio+' (aporte fijo mensual × 12)</div>'+
      '<div class="platform-total-value tabular" style="font-size:20px;">'+money(aporteAnio)+'<span class="of-text"> de '+money(objetivoAnual)+'</span></div>'+
      '<div class="budget-track" style="margin-top:10px;"><div class="budget-fill" style="width:'+Math.max(0,Math.min(100,anualPct))+'%;background:var(--accent);"></div></div>'+
      '<div class="platform-total-sub"><span>'+Math.round(anualPct)+'% completado este año</span></div>'+
      otrosAporteLine+
      // Small detail: how much "all your fixed-aporte goals" add up to per month, in money — and
      // along the way makes clear that this same number is what defines your Investment goal %
      // in Balance.
      '<div class="platform-total-sub" style="margin-top:2px;color:var(--text-tertiary);font-size:11.5px;">Aporte mensual objetivo: <b class="tabular">'+money(monthlyInvestmentGoalCLP())+'</b> · '+Math.round(investmentGoalPct())+'% de tus ingresos</div>'+
      renderTotalChecksGrid()+
    '</div>'
  ) : (
    // Every goal is flow-only (no fixed aporteMensualMeta at all) -- a 0/$0 bar would just look
    // broken, so this shows an honest message instead of a meaningless progress bar. The racha/
    // checks grid stays untouched either way (it's driven by TOTAL_GOAL_CHECKS, unrelated to
    // this calculation).
    '<div class="platform-total-goal-block">'+
      '<div class="platform-total-label" style="color:var(--accent-ink);">Objetivo de inversión '+anio+'</div>'+
      '<p class="muted" style="font-size:12.5px;margin:4px 0 0;">Ninguna de tus metas tiene un aporte mensual fijo todavía, así que no hay un objetivo anual que medir.'+(otrosAporteAnio>0?' Aun así, llevas '+money(otrosAporteAnio)+' invertidos este año.':'')+'</p>'+
      renderTotalChecksGrid()+
    '</div>'
  ));

  const proy = projectedContributions(3, 20);
  const proyeccionCard = proy.meses.length>=2 ? (
    '<div class="card proyeccion-card">'+
      '<div class="proyeccion-head"><span class="proyeccion-icon">'+ICONS.sparkle+'</span><span class="proyeccion-title">Simulador</span></div>'+
      '<div class="proyeccion-value tabular" data-proj-total>'+money(proy.proyectadoConRetorno)+'</div>'+
      '<div class="proyeccion-sub">en '+proy.anios+' años · pesos nominales (sin descontar inflación)</div>'+
      '<div class="proyeccion-text">Aportando <input type="text" inputmode="numeric" class="proy-inline-input proy-aporte-input" data-proj-contribution-input placeholder="'+moneyPlain(Math.round(proy.promedioMensual))+'" value="'+(state.simulatedContribution!=null?moneyPlain(state.simulatedContribution):'')+'">/mes al '+
        '<input type="text" inputmode="decimal" class="proy-inline-input" data-proj-return-input value="'+proy.retornoAnual+'">% anual.</div>'+
      '<div class="proyeccion-caption">Promedio de tus últimas 3 inversiones mensuales: <b class="tabular">'+money(proy.promedioMensual)+'</b></div>'+
    '</div>'
  ) : '';

  const html =
    '<div class="card platform-total-card">'+
      '<div class="platform-total-label">Total invertido</div>'+
      '<div class="platform-total-value tabular">'+money(totalValor)+'</div>'+
      '<div class="stat-grid stat-grid-compact" style="margin-top:14px;margin-bottom:0;">'+
        '<div class="stat-tile stat-inversiones"><div class="stat-label">Aportado neto</div><div class="stat-value tabular">'+money(totalAportado)+'</div></div>'+
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

export function renderSummarySubContent(){
  if(state.summarySub==='balance') renderBalanceView();
  else if(state.summarySub==='presupuesto') renderBudgetView();
  else if(state.summarySub==='evolucion') renderEvolutionView();
  else if(state.summarySub==='inversiones') renderInvestmentsView();
  else renderComingSoon(state.summarySub);
}

export const SUBS_META = {
  balance:{label:'Balance'},
  presupuesto:{label:'Presupuesto'},
  evolucion:{label:'Evolución'},
  inversiones:{label:'Inversiones'}
};
// The inner body of the sub-tabs bar, separated out, so it can be repainted for ONLY this
// while a tab is being dragged (without touching #resumen-content or losing the drag).
export function renderSummarySubtabsInner(){
  return state.summarySubOrder.map(id=>
    '<button class="subtab '+(state.summarySub===id?'active':'')+(state.subtabDragId===id?' dragging':'')+'" data-summary-sub="'+id+'">'+SUBS_META[id].label+'</button>'
  ).join('');
}

export function renderSummaryView(){
  document.getElementById('header-title').textContent = 'Resumen';
  const subHtml = '<div class="subtabs" id="resumen-subtabs">'+renderSummarySubtabsInner()+'</div>';
  document.getElementById('view-root').innerHTML = subHtml + '<div id="resumen-content"></div>';
  renderSummarySubContent();
}

