import { allCobrado, applyLockRule, catInfo, darPorPerdida, dayLabel, medioInfo, pendienteVinculadaA, porCobrarTotal, resolvePendiente, tienePorCobrarTipo } from './helpers';
import { render } from './render';
import { ensureMonthExists, formatEditableNumber, regenerateCuotasFor, repartirIguales, safeEvalExpr, saldoGrupo } from './shared-expenses';
import { BOLETA_EJEMPLOS, boletaItemIdCounter, boletaTotal, closeSheet, getTx, guardarBoleta, medioIdCounter, nextBoletaItemId, openBoletaFlow, openFilterSheet, openLinkFromIngreso, openLinkFromPendiente, openNewTxSheet, openSheet, renderBoletaItemsTotalsSummary, renderSheet, saveDraftTx, setMedioIdCounter } from './sheet';
import { CATS, DATOS_TRANSFERENCIA, MEDIOS, METAS_GASTO_PCT, METAS_INVERSION, METAS_TOTAL_CHECKS, MONTHS, PLANIFICADOR, PLATAFORMA_DATA, PRESUPUESTOS, TX, metaIdCounter, money, moneyPlain, presupuestoTotalMensual, setDATOS_TRANSFERENCIA, setMETAS_INVERSION, setMetaIdCounter, setPresupuestoTotalMensual, setSubtabDrag, setSuppressNextSubtabClick, setTX, state, subtabDrag, suppressNextSubtabClick, todayISO } from './state';
import { handleLogout, switchAuthMode } from './supabase';
import { toast } from './ui/toasts';
import { PROYECCION_SUPUESTOS, metasForPlataforma, renderEvolucionView } from './views/evolucion';
import { defaultCompartirDraft, miParticipanteEnGrupo, renderGruposView } from './views/grupos';
import { platformValorActual, renderInversionesView, renderResumenSubContent, renderResumenSubtabsInner, renderResumenView, updatePlanCompute, updateProyeccionCompute } from './views/inversiones';
import { absorbImportedRows, activarNotificaciones, agregarParticipanteSinCuenta, buildBackupJSON, buildCobroWhatsAppText, buildTransaccionesCSV, buscarTxParecida, cargarCartolasDisponibles, catEnUso, clasificarGastoCompartidoAjeno, compartirTransaccionExistente, crearGrupo, crearTxDesdeMovimiento, datosTransferenciaCompletos, desactivarNotificaciones, downloadFile, enviarPushPrueba, importCartolaRows, intentarAbrirArchivoCartola, loadImportCorreoScreen, loadNotifStatus, medioEnUso, parseCartolaCSV, registrarSaldoPagado, renderMenuView, unirseAGrupo, usarCartolaImportada } from './views/menu';
import { renderPresupuestoView } from './views/presupuesto';
import { openSueldoSuggestionSheet, renderTransaccionesView, renderTxResultsOnly } from './views/transacciones';
/* ===================== EVENT HANDLING (delegated) ===================== */
export const phone = document.getElementById('phone');

phone.addEventListener('click', function(e: any){
  const authTabBtn = e.target.closest('[data-auth-tab]');
  if(authTabBtn){ switchAuthMode(authTabBtn.getAttribute('data-auth-tab')); return; }
  const authLogoutBtn = e.target.closest('[data-auth-logout]');
  if(authLogoutBtn){ handleLogout(); return; }

  const copyTextBtn = e.target.closest('[data-copy-text]');
  if(copyTextBtn){
    const txt = copyTextBtn.getAttribute('data-copy-text');
    if(txt && navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){ toast('Copiado'); }).catch(function(){ toast('No se pudo copiar'); });
    }
    return;
  }
  const reloadImportCorreoBtn = e.target.closest('[data-reload-import-correo]');
  if(reloadImportCorreoBtn){
    state.importCorreoLoaded = false; state.importCorreoError = null; state.importCorreoLoading = true;
    renderMenuView();
    loadImportCorreoScreen();
    return;
  }
  const askDeleteTxBtn = e.target.closest('[data-ask-delete-tx]');
  if(askDeleteTxBtn){ state.confirmDeleteTxId = askDeleteTxBtn.getAttribute('data-ask-delete-tx'); renderSheet(); return; }
  const cancelDeleteTxBtn = e.target.closest('[data-cancel-delete-tx]');
  if(cancelDeleteTxBtn){ state.confirmDeleteTxId = null; renderSheet(); return; }
  const confirmDeleteTxBtn = e.target.closest('[data-confirm-delete-tx]');
  if(confirmDeleteTxBtn){
    const delId = confirmDeleteTxBtn.getAttribute('data-confirm-delete-tx');
    setTX(TX.filter(function(t){ return t.id!==delId; }));
    state.confirmDeleteTxId = null;
    closeSheet();
    render();
    toast('Transacción eliminada');
    return;
  }

  if(suppressNextSubtabClick){ setSuppressNextSubtabClick(false); return; }
  const fabBtn = e.target.closest('#fab-add');
  if(fabBtn){ openNewTxSheet(); return; }
  const tabBtn = e.target.closest('[data-tab]');
  if(tabBtn){
    state.tab = tabBtn.getAttribute('data-tab');
    render();
    // aprovechamos que abrió Transacciones para revisar si el script de Google dejó algo
    // nuevo en la bandeja de importadas y agregarlo solo, sin que tenga que ir a buscarlo
    if(state.tab==='transacciones') absorbImportedRows();
    return;
  }

  const filterBtn = e.target.closest('[data-filter]');
  if(filterBtn){ state.filter = filterBtn.getAttribute('data-filter'); render(); return; }

  const dismissSueldo = e.target.closest('[data-dismiss-sueldo-suggestion]');
  if(dismissSueldo){ state.sueldoBannerDescartadoMes = todayISO().slice(0,7); renderTransaccionesView(); return; }

  const confirmSueldo = e.target.closest('[data-confirm-sueldo-suggestion]');
  if(confirmSueldo){ openSueldoSuggestionSheet(confirmSueldo.getAttribute('data-confirm-sueldo-suggestion')); return; }

  const clearCat = e.target.closest('[data-clear-catfilter]');
  if(clearCat){ state.categoryFilter=null; state.categoryFilterMonth=null; render(); return; }

  const clearSearch = e.target.closest('[data-clear-search]');
  if(clearSearch){ state.searchQuery=''; renderTransaccionesView(); return; }

  const openFiltersBtn = e.target.closest('[data-open-filters]');
  if(openFiltersBtn){ openFilterSheet(); return; }

  const toggleFilterCat = e.target.closest('[data-toggle-filter-cat]');
  if(toggleFilterCat){
    const cid = toggleFilterCat.getAttribute('data-toggle-filter-cat');
    const arr = state.advFilters.cats;
    const i = arr.indexOf(cid);
    if(i>=0) arr.splice(i,1); else arr.push(cid);
    renderSheet();
    return;
  }
  const toggleFilterMedio = e.target.closest('[data-toggle-filter-medio]');
  if(toggleFilterMedio){
    const mid = toggleFilterMedio.getAttribute('data-toggle-filter-medio');
    const arr = state.advFilters.medios;
    const i = arr.indexOf(mid);
    if(i>=0) arr.splice(i,1); else arr.push(mid);
    renderSheet();
    return;
  }
  const clearAdv = e.target.closest('[data-clear-advfilters]');
  if(clearAdv){
    state.advFilters = {cats:[], medios:[], dateFrom:'', dateTo:''};
    renderSheet();
    return;
  }
  const applyAdv = e.target.closest('[data-apply-advfilters]');
  if(applyAdv){
    closeSheet();
    renderTransaccionesView();
    return;
  }

  const subBtn = e.target.closest('[data-resumen-sub]');
  if(subBtn){ state.resumenSub = subBtn.getAttribute('data-resumen-sub'); renderResumenView(); return; }

  const monthNav = e.target.closest('[data-month-nav]');
  if(monthNav && !monthNav.disabled){
    const d = parseInt(monthNav.getAttribute('data-month-nav'),10);
    state.monthIndex = Math.max(0, Math.min(MONTHS.length-1, state.monthIndex+d));
    renderResumenSubContent();
    return;
  }

  const legendRow = e.target.closest('[data-cat]');
  if(legendRow && (legendRow.classList.contains('legend-row') || legendRow.classList.contains('arc-seg'))){
    const cid = legendRow.getAttribute('data-cat');
    state.categoryFilter = cid;
    state.categoryFilterMonth = MONTHS[state.monthIndex];
    state.filter='todas';
    state.tab='transacciones';
    render();
    return;
  }

  const txItem = e.target.closest('[data-tx]');
  if(txItem && txItem.classList.contains('tx-item')){
    openSheet(txItem.getAttribute('data-tx'));
    return;
  }

  if(e.target.closest('#sheet-close-btn') || e.target===overlayEl() || e.target.closest('[data-close-sheet-done]')){
    closeSheet(); return;
  }

  const segBtn = e.target.closest('[data-seg-val]');
  if(segBtn && !segBtn.disabled){
    const group = segBtn.closest('[data-seg]').getAttribute('data-seg');
    const val = segBtn.getAttribute('data-seg-val');
    if(group==='draft-tipo' && state.draftTx){
      state.draftTx.tipo = val;
      state.draftTx.categorias = []; // la categoría depende del tipo, se reinicia
      renderSheet();
      return;
    }
    if(group==='draft-recurrencia' && state.draftTx){
      state.draftTx.recurrencia = val;
      renderSheet();
      return;
    }
    if(group==='meta-plazo'){
      state.metaDraft.plazo = val;
      renderInversionesView();
      return;
    }
    if(group==='platform-plazo'){
      state.platformDraft.plazo = val;
      renderInversionesView();
      return;
    }
    if(group==='newplatform-plazo'){
      state.newPlatformDraft.plazo = val;
      renderInversionesView();
      return;
    }
    if(group==='cat-draft-tipo'){
      state.catDraft.tipo = val;
      renderMenuView();
      return;
    }
    if(group==='compartir-pagador' && state.compartirDraft){
      state.compartirDraft.pagadoPorId = val;
      renderSheet();
      return;
    }
    const t = getTx(state.openTxId);
    if(t){
      if(group==='tipo' && t.tipo!==val){
        // La categoría depende del tipo (gasto/ingreso/inversión usan listas de categorías
        // distintas) — igual que al crear una transacción nueva, se reinicia para no dejar
        // una categoría "huérfana" que ya no corresponde a este tipo. Eso hacía que Balance
        // contara mal: una transacción de gasto con una categoría vieja de otro tipo se
        // colaba (o se perdía) en el desglose por categoría.
        t.tipo = val;
        t.categorias = [];
      }
      if(group==='recurrencia') t.recurrencia = val;
      renderSheet(); renderIfListVisible();
    }
    return;
  }

  const toggleCatEdit = e.target.closest('[data-toggle-catedit]');
  if(toggleCatEdit){
    const id = toggleCatEdit.getAttribute('data-toggle-catedit');
    state.categoryEditMode[id] = true;
    renderSheet();
    return;
  }
  const cancelCatEdit = e.target.closest('[data-cancel-catedit]');
  if(cancelCatEdit){
    const id = cancelCatEdit.getAttribute('data-cancel-catedit');
    state.categoryEditMode[id] = false;
    renderSheet();
    return;
  }

  const pickCatBtn = e.target.closest('[data-pick-cat]');
  if(pickCatBtn){
    const t = getTx(state.openTxId);
    if(t){
      const catId = pickCatBtn.getAttribute('data-pick-cat');
      if(t.compartidoAjeno){
        // Gasto de grupo que registró otra persona: además de clasificar esta transacción,
        // esto aprende el mapeo "su categoría -> la mía" para que los próximos gastos así se
        // clasifiquen solos (ver clasificarGastoCompartidoAjeno).
        clasificarGastoCompartidoAjeno(t.id, catId).then(function(){
          state.categoryEditMode[t.id] = false;
          toast('Clasificada como '+catInfo(catId).nombre);
          renderSheet(); renderIfListVisible();
        });
      } else {
        const wasClassified = t.categorias.length>0;
        t.categorias = [{cat:catId, monto:t.monto}];
        if(t.estado==='pendiente') t.estado='confirmado';
        state.categoryEditMode[t.id] = false;
        toast(wasClassified ? 'Categoría actualizada a '+catInfo(catId).nombre : 'Clasificada como '+catInfo(catId).nombre);
        renderSheet(); renderIfListVisible();
      }
    }
    return;
  }

  const toggleCuotas = e.target.closest('[data-toggle-cuotas]');
  if(toggleCuotas){
    const t = getTx(toggleCuotas.getAttribute('data-toggle-cuotas'));
    if(t){
      if(t.cuotas){ delete t.cuotas; } else { t.cuotas = {total:2}; }
      regenerateCuotasFor(t.id);
      renderSheet(); renderIfListVisible();
    }
    return;
  }
  const cuotasStep = e.target.closest('[data-cuotas-step]');
  if(cuotasStep){
    const t = getTx(cuotasStep.getAttribute('data-tx'));
    if(t && t.cuotas){
      const delta = parseInt(cuotasStep.getAttribute('data-cuotas-step'),10);
      t.cuotas.total = Math.max(2, Math.min(24, t.cuotas.total+delta));
      regenerateCuotasFor(t.id);
      renderSheet(); renderIfListVisible();
    }
    return;
  }

  const pagadoBtn = e.target.closest('[data-toggle-pagado]');
  if(pagadoBtn){
    const t = getTx(state.openTxId);
    const idx = parseInt(pagadoBtn.getAttribute('data-toggle-pagado'),10);
    if(t && t.porCobrar[idx]){
      t.porCobrar[idx].pagado = !t.porCobrar[idx].pagado;
      if(allCobrado(t)) toast('¡Ya te pagaron todo!');
      renderSheet(); renderIfListVisible();
    }
    return;
  }

  const saveDraftBtn = e.target.closest('[data-save-draft]');
  if(saveDraftBtn && !saveDraftBtn.disabled){ saveDraftTx(); return; }

  const cancelNewMedio = e.target.closest('[data-cancel-new-medio]');
  if(cancelNewMedio){
    state.addingMedio = false;
    renderSheet();
    return;
  }
  const saveNewMedio = e.target.closest('[data-save-new-medio]');
  if(saveNewMedio && !saveNewMedio.disabled){
    const nombre = state.newMedioDraft.nombre.trim();
    if(nombre && state.draftTx){
      setMedioIdCounter(medioIdCounter+1);
      const key = 'custom_'+medioIdCounter;
      const ultimos4 = state.newMedioDraft.ultimos4.trim();
      MEDIOS[key] = {nombre, corto: ultimos4 ? '•••• '+ultimos4 : nombre, icon:'card'};
      state.draftTx.medio = key;
      state.addingMedio = false;
      state.newMedioDraft = {nombre:'', ultimos4:''};
      toast('Tarjeta agregada: '+nombre);
      renderSheet();
    }
    return;
  }

  const editBudgetBtn = e.target.closest('[data-edit-budget]');
  if(editBudgetBtn){
    const catId = editBudgetBtn.getAttribute('data-edit-budget');
    const cfg = PRESUPUESTOS[catId];
    state.editingBudgetCat = catId;
    state.budgetDraft = cfg
      ? {meta:String(cfg.meta), alertas:Object.assign({},cfg.alertas)}
      : {meta:'', alertas:{80:true,90:true,100:true}};
    renderPresupuestoView();
    return;
  }
  const cancelBudgetEdit = e.target.closest('[data-cancel-budget-edit]');
  if(cancelBudgetEdit){
    state.editingBudgetCat = null;
    renderPresupuestoView();
    return;
  }
  const toggleAlert = e.target.closest('[data-toggle-alert]');
  if(toggleAlert){
    const t = toggleAlert.getAttribute('data-toggle-alert');
    state.budgetDraft.alertas[t] = !state.budgetDraft.alertas[t];
    renderPresupuestoView();
    return;
  }
  const saveBudget = e.target.closest('[data-save-budget]');
  if(saveBudget){
    const catId = saveBudget.getAttribute('data-save-budget');
    const meta = safeEvalExpr(state.budgetDraft.meta);
    if(meta!==null && meta>0){
      PRESUPUESTOS[catId] = {meta: Math.round(meta), alertas: Object.assign({},state.budgetDraft.alertas)};
      state.editingBudgetCat = null;
      toast('Presupuesto guardado: '+catInfo(catId).nombre);
      renderPresupuestoView();
    } else {
      toast('Pon una meta mensual válida');
    }
    return;
  }
  const deleteBudget = e.target.closest('[data-delete-budget]');
  if(deleteBudget){
    const catId = deleteBudget.getAttribute('data-delete-budget');
    delete PRESUPUESTOS[catId];
    state.editingBudgetCat = null;
    toast('Presupuesto eliminado');
    renderPresupuestoView();
    return;
  }
  const budgetVerMas = e.target.closest('[data-budget-vermas]');
  if(budgetVerMas){
    const catId = budgetVerMas.getAttribute('data-budget-vermas');
    state.categoryFilter = catId;
    state.categoryFilterMonth = MONTHS[state.monthIndex];
    state.filter = 'todas';
    state.tab = 'transacciones';
    render();
    return;
  }
  const editBudgetTotal = e.target.closest('[data-edit-budget-total]');
  if(editBudgetTotal){
    state.editingBudgetTotal = true;
    state.budgetTotalDraft = String(presupuestoTotalMensual);
    renderPresupuestoView();
    return;
  }
  const cancelBudgetTotal = e.target.closest('[data-cancel-budget-total]');
  if(cancelBudgetTotal){
    state.editingBudgetTotal = false;
    renderPresupuestoView();
    return;
  }
  const saveBudgetTotal = e.target.closest('[data-save-budget-total]');
  if(saveBudgetTotal){
    const v = safeEvalExpr(state.budgetTotalDraft);
    if(v!==null && v>0){
      setPresupuestoTotalMensual(Math.round(v));
      state.editingBudgetTotal = false;
      toast('Presupuesto total actualizado');
      renderPresupuestoView();
    } else {
      toast('Pon un presupuesto total válido');
    }
    return;
  }

  const editMetasGasto = e.target.closest('[data-edit-metas-gasto]');
  if(editMetasGasto){
    state.editingMetasGasto = true;
    state.metasGastoDraft = {fijo:String(METAS_GASTO_PCT.fijo), variable:String(METAS_GASTO_PCT.variable)};
    renderPresupuestoView();
    return;
  }
  const cancelMetasGasto = e.target.closest('[data-cancel-metas-gasto]');
  if(cancelMetasGasto){
    state.editingMetasGasto = false;
    renderPresupuestoView();
    return;
  }
  const saveMetasGasto = e.target.closest('[data-save-metas-gasto]');
  if(saveMetasGasto){
    const fijo = safeEvalExpr(state.metasGastoDraft.fijo);
    const variable = safeEvalExpr(state.metasGastoDraft.variable);
    if(fijo!==null && fijo>=0 && variable!==null && variable>=0){
      METAS_GASTO_PCT.fijo = Math.round(fijo);
      METAS_GASTO_PCT.variable = Math.round(variable);
      state.editingMetasGasto = false;
      toast('Metas actualizadas');
      renderPresupuestoView();
    } else {
      toast('Pon valores válidos para Fijo y Variable');
    }
    return;
  }

  const editDatosTransferencia = e.target.closest('[data-edit-datos-transferencia]');
  if(editDatosTransferencia){
    state.editingDatosTransferencia = true;
    state.datosTransferenciaDraft = Object.assign({}, DATOS_TRANSFERENCIA);
    renderMenuView();
    return;
  }
  const cancelDatosTransferencia = e.target.closest('[data-cancel-datos-transferencia]');
  if(cancelDatosTransferencia){
    state.editingDatosTransferencia = false;
    renderMenuView();
    return;
  }
  const saveDatosTransferencia = e.target.closest('[data-save-datos-transferencia]');
  if(saveDatosTransferencia){
    setDATOS_TRANSFERENCIA(Object.assign({}, state.datosTransferenciaDraft));
    Object.keys(DATOS_TRANSFERENCIA).forEach(k=>{ DATOS_TRANSFERENCIA[k] = (DATOS_TRANSFERENCIA[k]||'').trim(); });
    state.editingDatosTransferencia = false;
    toast('Datos de transferencia guardados');
    renderMenuView();
    return;
  }

  const copyCobroBtn = e.target.closest('[data-copy-cobro]');
  if(copyCobroBtn){
    const t = getTx(copyCobroBtn.getAttribute('data-copy-cobro'));
    const txt = t ? buildCobroWhatsAppText(t) : null;
    if(!txt){ toast('No hay cobros pendientes para copiar'); return; }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){
        toast(datosTransferenciaCompletos() ? 'Copiado — listo para pegar en WhatsApp' : 'Copiado — agrega tus datos de transferencia en Menú > Mi cuenta para incluirlos');
      }).catch(function(){ toast('No se pudo copiar'); });
    } else {
      toast('No se pudo copiar');
    }
    return;
  }

  const evoMonthGroup = e.target.closest('[data-evo-month]');
  if(evoMonthGroup){
    state.evoSelectedMonth = evoMonthGroup.getAttribute('data-evo-month');
    renderEvolucionView();
    return;
  }
  const editMetaBtn = e.target.closest('[data-edit-meta]');
  if(editMetaBtn){
    const id = editMetaBtn.getAttribute('data-edit-meta');
    const meta = METAS_INVERSION.find(m=>m.id===id);
    state.editingMetaId = id;
    state.metaDraft = meta
      ? {nombre:meta.nombre, montoObjetivo:String(meta.montoObjetivo), aporteMensualMeta:String(meta.aporteMensualMeta), plazo:meta.plazo||'', comision:meta.comision!=null?String(meta.comision):''}
      : {nombre:'', montoObjetivo:'', aporteMensualMeta:'', plazo:'', comision:''};
    renderInversionesView();
    return;
  }
  const addMetaBtn = e.target.closest('[data-add-meta]');
  if(addMetaBtn){
    state.editingMetaId = 'nueva';
    state.addMetaPlataformaId = addMetaBtn.getAttribute('data-add-meta');
    state.metaDraft = {nombre:'', montoObjetivo:'', aporteMensualMeta:'', plazo:'', comision:''};
    renderInversionesView();
    return;
  }
  const cancelMetaEdit = e.target.closest('[data-cancel-meta-edit]');
  if(cancelMetaEdit){
    state.editingMetaId = null;
    state.addMetaPlataformaId = null;
    renderInversionesView();
    return;
  }
  const saveMetaBtn = e.target.closest('[data-save-meta]');
  if(saveMetaBtn){
    const id = saveMetaBtn.getAttribute('data-save-meta');
    const nombre = state.metaDraft.nombre.trim();
    const objetivo = safeEvalExpr(state.metaDraft.montoObjetivo);
    const aporte = safeEvalExpr(state.metaDraft.aporteMensualMeta);
    const comisionRaw = state.metaDraft.comision.trim();
    const comisionVal = comisionRaw==='' ? null : safeEvalExpr(comisionRaw);
    const comisionFinal = (comisionRaw!=='' && comisionVal!==null) ? comisionVal : null;
    if(nombre && objetivo!==null && objetivo>0 && aporte!==null && aporte>=0){
      if(id==='nueva'){
        setMetaIdCounter(metaIdCounter+1);
        const newId = 'm'+metaIdCounter;
        // Una meta nueva arranca su historial desde el mes actual — no se le inventan
        // meses "incumplidos" hacia atrás, de antes de que existiera.
        const mesActual = todayISO().slice(0,7);
        const historial: Record<string, number> = {}; historial[mesActual] = 0;
        const checks: Record<string, boolean> = {}; checks[mesActual] = false;
        METAS_INVERSION.push({id:newId, nombre, montoObjetivo:Math.round(objetivo), aporteMensualMeta:Math.round(aporte), plataformaId:state.addMetaPlataformaId, plazo:state.metaDraft.plazo||null, comision:comisionFinal, aportadoNeto:0, historial, checks});
        toast('Meta creada: '+nombre);
      } else {
        const meta = METAS_INVERSION.find(m=>m.id===id);
        if(meta){ meta.nombre = nombre; meta.montoObjetivo = Math.round(objetivo); meta.aporteMensualMeta = Math.round(aporte); meta.plazo = state.metaDraft.plazo||null; meta.comision = comisionFinal; }
        toast('Meta actualizada');
      }
      state.editingMetaId = null;
      state.addMetaPlataformaId = null;
      renderInversionesView();
    } else {
      toast('Completa nombre, objetivo y aporte meta válidos');
    }
    return;
  }
  const deleteMetaBtn = e.target.closest('[data-delete-meta]');
  if(deleteMetaBtn){
    const id = deleteMetaBtn.getAttribute('data-delete-meta');
    setMETAS_INVERSION(METAS_INVERSION.filter(m=>m.id!==id));
    state.editingMetaId = null;
    toast('Meta eliminada');
    renderInversionesView();
    return;
  }
  const toggleMetaCheck = e.target.closest('[data-toggle-meta-check]');
  if(toggleMetaCheck){
    const id = toggleMetaCheck.getAttribute('data-toggle-meta-check');
    const mk = toggleMetaCheck.getAttribute('data-toggle-meta-month');
    const meta = METAS_INVERSION.find(m=>m.id===id);
    if(meta){ meta.checks[mk] = !meta.checks[mk]; renderInversionesView(); }
    return;
  }
  const toggleMetaTotalCheck = e.target.closest('[data-toggle-meta-total-check]');
  if(toggleMetaTotalCheck){
    const mk = toggleMetaTotalCheck.getAttribute('data-toggle-meta-total-check');
    METAS_TOTAL_CHECKS[mk] = !METAS_TOTAL_CHECKS[mk];
    renderInversionesView();
    return;
  }

  const togglePlatformBtn = e.target.closest('[data-toggle-platform]');
  if(togglePlatformBtn){
    const id = togglePlatformBtn.getAttribute('data-toggle-platform');
    state.platformAbierta = (state.platformAbierta===id) ? null : id;
    renderInversionesView();
    return;
  }

  const editPlatformBtn = e.target.closest('[data-edit-platform]');
  if(editPlatformBtn){
    const id = editPlatformBtn.getAttribute('data-edit-platform');
    state.editingPlatformId = id;
    state.confirmDeletePlatformId = null;
    state.confirmArchivePlatformId = null;
    state.platformDraft = {
      valor: String(platformValorActual(id)),
      tasaAnual: PLATAFORMA_DATA[id].tasaAnual!=null ? String(PLATAFORMA_DATA[id].tasaAnual) : '',
      comision: PLATAFORMA_DATA[id].comision!=null ? String(PLATAFORMA_DATA[id].comision) : '',
      plazo: PLATAFORMA_DATA[id].plazo || ''
    };
    renderInversionesView();
    return;
  }
  const cancelPlatformEdit = e.target.closest('[data-cancel-platform-edit]');
  if(cancelPlatformEdit){
    state.editingPlatformId = null;
    state.confirmDeletePlatformId = null;
    state.confirmArchivePlatformId = null;
    renderInversionesView();
    return;
  }
  const savePlatformBtn = e.target.closest('[data-save-platform]');
  if(savePlatformBtn){
    const id = savePlatformBtn.getAttribute('data-save-platform');
    const valor = safeEvalExpr(state.platformDraft.valor);
    const tasaRaw = state.platformDraft.tasaAnual.trim();
    const tasa = tasaRaw==='' ? null : safeEvalExpr(tasaRaw);
    const comisionRaw = state.platformDraft.comision.trim();
    const comisionVal = comisionRaw==='' ? null : safeEvalExpr(comisionRaw);
    if(valor!==null && valor>=0){
      const mesActual = todayISO().slice(0,7);
      PLATAFORMA_DATA[id].valorHistorial[mesActual] = Math.round(valor);
      PLATAFORMA_DATA[id].fechaActualizacion = todayISO();
      PLATAFORMA_DATA[id].tasaAnual = (tasaRaw!=='' && tasa!==null) ? tasa : null;
      PLATAFORMA_DATA[id].comision = (comisionRaw!=='' && comisionVal!==null) ? comisionVal : null;
      PLATAFORMA_DATA[id].plazo = state.platformDraft.plazo || null;
      state.editingPlatformId = null;
      toast('Valor actualizado: '+catInfo(id).nombre);
      renderInversionesView();
    } else {
      toast('Pon un valor válido');
    }
    return;
  }
  const deletePlatformBtn = e.target.closest('[data-delete-platform]');
  if(deletePlatformBtn){
    const id = deletePlatformBtn.getAttribute('data-delete-platform');
    if(catEnUso(id)){ toast('No puedes eliminar una plataforma con transacciones'); return; }
    if(metasForPlataforma(id).length>0){ toast('Elimina primero sus metas'); return; }
    state.confirmDeletePlatformId = id;
    renderInversionesView();
    return;
  }
  const cancelDeletePlatformBtn = e.target.closest('[data-cancel-delete-platform]');
  if(cancelDeletePlatformBtn){
    state.confirmDeletePlatformId = null;
    renderInversionesView();
    return;
  }
  const confirmDeletePlatformBtn = e.target.closest('[data-confirm-delete-platform]');
  if(confirmDeletePlatformBtn){
    const id = confirmDeletePlatformBtn.getAttribute('data-confirm-delete-platform');
    if(catEnUso(id)){ toast('No puedes eliminar una plataforma con transacciones'); return; }
    if(metasForPlataforma(id).length>0){ toast('Elimina primero sus metas'); return; }
    const nombre = catInfo(id).nombre;
    delete CATS[id];          // esto también la saca de Menú > Categorías, que solo lista lo que hay en CATS
    delete PLATAFORMA_DATA[id];
    state.editingPlatformId = null;
    state.confirmDeletePlatformId = null;
    toast('Plataforma eliminada: '+nombre);
    renderInversionesView();
    return;
  }
  const archivePlatformBtn = e.target.closest('[data-archive-platform]');
  if(archivePlatformBtn){
    const id = archivePlatformBtn.getAttribute('data-archive-platform');
    if(metasForPlataforma(id).length>0){ toast('Elimina primero sus metas'); return; }
    state.confirmArchivePlatformId = id;
    renderInversionesView();
    return;
  }
  const cancelArchivePlatformBtn = e.target.closest('[data-cancel-archive-platform]');
  if(cancelArchivePlatformBtn){
    state.confirmArchivePlatformId = null;
    renderInversionesView();
    return;
  }
  const confirmArchivePlatformBtn = e.target.closest('[data-confirm-archive-platform]');
  if(confirmArchivePlatformBtn){
    const id = confirmArchivePlatformBtn.getAttribute('data-confirm-archive-platform');
    if(metasForPlataforma(id).length>0){ toast('Elimina primero sus metas'); return; }
    PLATAFORMA_DATA[id].archivada = true;
    state.editingPlatformId = null;
    state.confirmArchivePlatformId = null;
    toast('Plataforma cerrada: '+catInfo(id).nombre);
    renderInversionesView();
    return;
  }
  const reopenPlatformBtn = e.target.closest('[data-reopen-platform]');
  if(reopenPlatformBtn){
    const id = reopenPlatformBtn.getAttribute('data-reopen-platform');
    PLATAFORMA_DATA[id].archivada = false;
    toast('Plataforma reabierta: '+catInfo(id).nombre);
    renderInversionesView();
    return;
  }

  const addPlatformBtn = e.target.closest('[data-add-platform]');
  if(addPlatformBtn){
    state.creatingPlatform = true;
    state.newPlatformDraft = {nombre:'', icon:'bank', color:'butter', valor:'', plazo:''};
    renderInversionesView();
    return;
  }
  const cancelNewPlatformBtn = e.target.closest('[data-cancel-newplatform]');
  if(cancelNewPlatformBtn){
    state.creatingPlatform = false;
    renderInversionesView();
    return;
  }
  const newPlatformIconBtn = e.target.closest('[data-newplatform-icon]');
  if(newPlatformIconBtn){ state.newPlatformDraft.icon = newPlatformIconBtn.getAttribute('data-newplatform-icon'); renderInversionesView(); return; }
  const newPlatformColorBtn = e.target.closest('[data-newplatform-color]');
  if(newPlatformColorBtn){ state.newPlatformDraft.color = newPlatformColorBtn.getAttribute('data-newplatform-color'); renderInversionesView(); return; }
  const saveNewPlatformBtn = e.target.closest('[data-save-newplatform]');
  if(saveNewPlatformBtn){
    const d = state.newPlatformDraft;
    if(!d.nombre.trim()){ toast('Ponle un nombre a la plataforma'); return; }
    const valor = d.valor.trim()==='' ? 0 : safeEvalExpr(d.valor);
    if(valor===null || valor<0){ toast('Pon un valor válido (o déjalo en 0)'); return; }
    const id = 'plataforma_'+Date.now();
    CATS[id] = {nombre:d.nombre.trim(), tipo:'inversion', color:d.color, icon:d.icon};
    // se rellenan todos los meses ya existentes con el mismo valor inicial (línea plana antes de
    // crearla) para no romper el gráfico compartido "Aportado vs. valor mes a mes", que solo
    // grafica los meses donde TODAS las plataformas tienen dato.
    const valorHistorial = {};
    MONTHS.forEach(m=>{ valorHistorial[m] = Math.round(valor); });
    PLATAFORMA_DATA[id] = {valorHistorial, fechaActualizacion: todayISO(), tasaAnual:null, comision:null, plazo: d.plazo || null};
    state.creatingPlatform = false;
    toast('Plataforma agregada: '+d.nombre.trim());
    renderInversionesView();
    return;
  }

  const platformVerMas = e.target.closest('[data-platform-vermas]');
  if(platformVerMas){
    const id = platformVerMas.getAttribute('data-platform-vermas');
    state.categoryFilter = id;
    state.categoryFilterMonth = null;
    state.filter = 'todas';
    state.tab = 'transacciones';
    render();
    return;
  }

  const lockBtn = e.target.closest('[data-toggle-lock]');
  if(lockBtn){
    const t = getTx(lockBtn.getAttribute('data-toggle-lock'));
    if(t){
      if(!t.reglaAuto){ applyLockRule(t); toast('Regla creada para '+t.comercio); }
      else { t.reglaAuto=false; }
      renderSheet(); renderIfListVisible();
    }
    return;
  }

  const actionBtn = e.target.closest('[data-action]');
  if(actionBtn){
    const t = getTx(actionBtn.getAttribute('data-tx'));
    const act = actionBtn.getAttribute('data-action');
    if(t){
      if(act==='confirmar'){
        if(t.categorias.length===0){ toast('Primero elige una categoría'); }
        else { t.estado='confirmado'; toast('Marcado como confirmado'); }
      }
      else if(act==='porcobrar_persona'){
        if(tienePorCobrarTipo(t,'persona')){
          // ya estaba marcada — apretar de nuevo la deselecciona (quita solo las filas de
          // este tipo; si no queda ninguna cobranza/reembolso pendiente, vuelve a confirmado).
          t.porCobrar = t.porCobrar.filter(p=>p.tipo!=='persona');
          if(t.porCobrar.length===0){ t.estado = t.categorias.length>0 ? 'confirmado' : 'pendiente'; state.splitCobroMode[t.id]=false; }
          toast('Se quitó el cobro pendiente');
        } else {
          t.estado='por_cobrar'; state.splitCobroMode[t.id]=true;
          const already = t.porCobrar.reduce((s,p)=>s+(p.monto||0),0);
          const remaining = Math.max(t.monto - already, 0);
          t.porCobrar.push({persona:'', monto: Math.round(remaining/2), pagado:false, tipo:'persona', montoRecibido:null, linkedTxId:null});
          toast('Marcado como por cobrar');
        }
      }
      else if(act==='porcobrar_reembolso'){
        if(tienePorCobrarTipo(t,'reembolso')){
          t.porCobrar = t.porCobrar.filter(p=>p.tipo!=='reembolso');
          if(t.porCobrar.length===0){ t.estado = t.categorias.length>0 ? 'confirmado' : 'pendiente'; state.splitCobroMode[t.id]=false; }
          toast('Se quitó el reembolso pendiente');
        } else {
          t.estado='por_cobrar'; state.splitCobroMode[t.id]=true;
          t.porCobrar.push({persona:'', monto:null, pagado:false, tipo:'reembolso', montoRecibido:null, linkedTxId:null});
          toast('Marcado como reembolso pendiente');
        }
      }
      else if(act==='noesgasto'){
        if(t.estado==='no_es_gasto'){
          t.estado = t.categorias.length>0 ? 'confirmado' : 'pendiente';
          toast('Ya no está marcado como "no es gasto"');
        } else {
          t.estado='no_es_gasto'; toast('Marcado como no es gasto');
        }
      }
      renderSheet(); renderIfListVisible();
    }
    return;
  }

  const toggleCatSplit = e.target.closest('[data-toggle-catsplit]');
  if(toggleCatSplit){
    const id = toggleCatSplit.getAttribute('data-toggle-catsplit');
    state.splitCatMode[id]=true;
    renderSheet();
    return;
  }
  const catUnitBtn = e.target.closest('[data-catunit]');
  if(catUnitBtn){
    state.splitCatUnit[state.openTxId] = catUnitBtn.getAttribute('data-catunit');
    renderSheet();
    return;
  }
  const addCatRow = e.target.closest('[data-add-catrow]');
  if(addCatRow){
    const t = getTx(addCatRow.getAttribute('data-add-catrow'));
    if(t){
      const usedCats = t.categorias.map(c=>c.cat);
      const pool = Object.keys(CATS).filter(k=>CATS[k].tipo===t.tipo && !usedCats.includes(k));
      const nextCat = pool[0] || Object.keys(CATS).find(k=>CATS[k].tipo===t.tipo);
      t.categorias.push({cat:nextCat, monto:0});
      renderSheet();
    }
    return;
  }
  const rmCatRow = e.target.closest('[data-cat-remove]');
  if(rmCatRow){
    const t = getTx(state.openTxId);
    const idx = parseInt(rmCatRow.getAttribute('data-cat-remove'),10);
    if(t && t.categorias.length>1){
      const removedMonto = t.categorias[idx].monto;
      t.categorias.splice(idx,1);
      t.categorias[0].monto += removedMonto;
      renderSheet(); renderIfListVisible();
    }
    return;
  }

  const toggleCobroSplit = e.target.closest('[data-toggle-cobrosplit]');
  if(toggleCobroSplit){
    state.splitCobroMode[toggleCobroSplit.getAttribute('data-toggle-cobrosplit')] = true;
    renderSheet();
    return;
  }
  const cobroUnitBtn = e.target.closest('[data-cobrounit]');
  if(cobroUnitBtn){
    state.splitCobroUnit[state.openTxId] = cobroUnitBtn.getAttribute('data-cobrounit');
    renderSheet();
    return;
  }
  const addContact = e.target.closest('[data-add-contact]');
  if(addContact){
    const t = getTx(state.openTxId);
    if(t){
      const name = addContact.getAttribute('data-add-contact');
      const already = t.porCobrar.reduce((s,p)=>s+(p.monto||0),0);
      const remaining = Math.max(t.monto - already, 0);
      const share = t.porCobrar.length===0 ? Math.round(remaining/2) : Math.round(remaining/2);
      t.porCobrar.push({persona:name, monto: share, pagado:false, tipo:'persona', montoRecibido:null, linkedTxId:null});
      if(t.estado!=='por_cobrar'){ t.estado='por_cobrar'; }
      state.splitCobroMode[t.id]=true;
      renderSheet(); renderIfListVisible();
    }
    return;
  }
  const addCobroRow = e.target.closest('[data-add-cobrorow]');
  if(addCobroRow){
    const t = getTx(addCobroRow.getAttribute('data-add-cobrorow'));
    if(t){
      const already = t.porCobrar.reduce((s,p)=>s+(p.monto||0),0);
      const remaining = Math.max(t.monto - already, 0);
      t.porCobrar.push({persona:'', monto: Math.round(remaining/2), pagado:false, tipo:'persona', montoRecibido:null, linkedTxId:null});
      renderSheet();
    }
    return;
  }
  const addReembolsoRow = e.target.closest('[data-add-reembolsorow]');
  if(addReembolsoRow){
    const t = getTx(addReembolsoRow.getAttribute('data-add-reembolsorow'));
    if(t){
      t.porCobrar.push({persona:'', monto:null, pagado:false, tipo:'reembolso', montoRecibido:null, linkedTxId:null});
      if(t.estado!=='por_cobrar'){ t.estado='por_cobrar'; }
      state.splitCobroMode[t.id]=true;
      renderSheet(); renderIfListVisible();
    }
    return;
  }
  const linkPendienteBtn = e.target.closest('[data-link-pendiente]');
  if(linkPendienteBtn){
    const idx = parseInt(linkPendienteBtn.getAttribute('data-link-pendiente'),10);
    openLinkFromPendiente(state.openTxId, idx);
    return;
  }
  const darPorPerdidaBtn = e.target.closest('[data-dar-por-perdida]');
  if(darPorPerdidaBtn){
    const idx = parseInt(darPorPerdidaBtn.getAttribute('data-dar-por-perdida'),10);
    if(darPorPerdida(state.openTxId, idx)){
      toast('Registrada como gasto de este mes');
      renderSheet(); renderIfListVisible();
    }
    return;
  }
  const openLinkIngresoBtn = e.target.closest('[data-open-link-ingreso]');
  if(openLinkIngresoBtn){
    openLinkFromIngreso(openLinkIngresoBtn.getAttribute('data-open-link-ingreso'));
    return;
  }
  const unlinkPendienteBtn = e.target.closest('[data-unlink-ingreso]');
  if(unlinkPendienteBtn){
    const ingresoId = unlinkPendienteBtn.getAttribute('data-unlink-ingreso');
    const found = pendienteVinculadaA(ingresoId);
    if(found){
      const gastoTx = getTx(found.gastoTxId);
      const p = gastoTx.porCobrar[found.idx];
      p.pagado = false; p.montoRecibido = null; p.linkedTxId = null;
      toast('Vínculo eliminado');
      renderSheet(); renderIfListVisible();
    }
    return;
  }
  const pickIngresoBtn = e.target.closest('[data-pick-ingreso]');
  if(pickIngresoBtn && state.linkFlow && state.linkFlow.mode==='fromPendiente'){
    const ingresoId = pickIngresoBtn.getAttribute('data-pick-ingreso');
    const {gastoTxId, idx} = state.linkFlow;
    if(resolvePendiente(gastoTxId, idx, ingresoId)){
      state.linkFlow = null;
      toast('Depósito vinculado');
      openSheet(gastoTxId);
      renderIfListVisible();
    }
    return;
  }
  const pickPendienteBtn = e.target.closest('[data-pick-pendiente]');
  if(pickPendienteBtn && state.linkFlow && state.linkFlow.mode==='fromIngreso'){
    const [gastoTxId, idxStr] = pickPendienteBtn.getAttribute('data-pick-pendiente').split('|');
    const idx = parseInt(idxStr,10);
    const ingresoTxId = state.linkFlow.ingresoTxId;
    if(resolvePendiente(gastoTxId, idx, ingresoTxId)){
      state.linkFlow = null;
      toast('Pendiente vinculado');
      openSheet(ingresoTxId);
      renderIfListVisible();
    }
    return;
  }
  const rmCobroRow = e.target.closest('[data-cobro-remove]');
  if(rmCobroRow){
    const t = getTx(state.openTxId);
    const idx = parseInt(rmCobroRow.getAttribute('data-cobro-remove'),10);
    if(t){ t.porCobrar.splice(idx,1); renderSheet(); renderIfListVisible(); }
    return;
  }

  /* ---------- Dividir boleta con amigos (simulado) ---------- */
  const openBoletaBtn = e.target.closest('[data-open-boleta]');
  if(openBoletaBtn){ openBoletaFlow(openBoletaBtn.getAttribute('data-open-boleta')); return; }
  const boletaCaptureBtn = e.target.closest('[data-boleta-capture]');
  if(boletaCaptureBtn && state.boleta){
    state.boleta.step = 'procesando';
    renderSheet();
    setTimeout(function(){
      if(!state.boleta || state.boleta.step!=='procesando') return; // el sheet pudo cerrarse mientras "procesaba"
      // el nombre del comercio ya lo sabemos (es el de la transacción real) — de la "foto" solo tomamos los items
      const ejemplo = BOLETA_EJEMPLOS[Math.floor(Math.random()*BOLETA_EJEMPLOS.length)];
      state.boleta.items = ejemplo.items.map(function(it){ return {id: nextBoletaItemId(), nombre: it.nombre, monto: it.monto}; });
      state.boleta.step = 'items';
      renderSheet();
    }, 900);
    return;
  }
  const boletaItemRemoveBtn = e.target.closest('[data-boleta-item-remove]');
  if(boletaItemRemoveBtn && state.boleta){
    const idx = parseInt(boletaItemRemoveBtn.getAttribute('data-boleta-item-remove'),10);
    state.boleta.items.splice(idx,1);
    renderSheet();
    return;
  }
  const boletaAddItemBtn = e.target.closest('[data-boleta-add-item]');
  if(boletaAddItemBtn && state.boleta){
    state.boleta.items.push({id: nextBoletaItemId(), nombre:'', monto:0});
    renderSheet();
    return;
  }
  const boletaGotoBtn = e.target.closest('[data-boleta-goto]');
  if(boletaGotoBtn && state.boleta){
    state.boleta.step = boletaGotoBtn.getAttribute('data-boleta-goto');
    renderSheet();
    return;
  }
  const boletaTogglePersonBtn = e.target.closest('[data-boleta-toggle-person]');
  if(boletaTogglePersonBtn && state.boleta){
    const [itemIdStr, persona] = boletaTogglePersonBtn.getAttribute('data-boleta-toggle-person').split('|');
    const itemId = parseInt(itemIdStr,10);
    const asign = state.boleta.asign;
    const list = asign[itemId] || (asign[itemId] = []);
    const pos = list.indexOf(persona);
    if(pos===-1) list.push(persona); else list.splice(pos,1);
    renderSheet();
    return;
  }
  const boletaGuardarBtn = e.target.closest('[data-boleta-guardar]');
  if(boletaGuardarBtn && state.boleta){ guardarBoleta(); return; }
  const boletaPropinaUnitBtn = e.target.closest('[data-boleta-propina-unit]');
  if(boletaPropinaUnitBtn && state.boleta){
    state.boleta.propinaUnit = boletaPropinaUnitBtn.getAttribute('data-boleta-propina-unit');
    state.boleta.propinaValor = ''; // cambiar de % a $ (o viceversa) parte de cero para no confundir unidades
    renderSheet();
    return;
  }
  const boletaPropinaQuickBtn = e.target.closest('[data-boleta-propina-quick]');
  if(boletaPropinaQuickBtn && state.boleta){
    state.boleta.propinaUnit = '%';
    state.boleta.propinaValor = boletaPropinaQuickBtn.getAttribute('data-boleta-propina-quick');
    renderSheet();
    return;
  }

  /* ---------- Menú (Fase 4) ---------- */
  const menuOpenBtn = e.target.closest('[data-menu-open]');
  if(menuOpenBtn){
    state.menuSection = menuOpenBtn.getAttribute('data-menu-open');
    if(state.menuSection==='importarcorreo' && !state.importCorreoLoaded){
      state.importCorreoLoading = true;
      renderMenuView();
      loadImportCorreoScreen();
      return;
    }
    if(state.menuSection==='reconciliar' && !state.reconciliar.movimientos.length){
      cargarCartolasDisponibles();
    }
    if(state.menuSection==='notificaciones' && !state.notifLoaded){
      loadNotifStatus();
      return;
    }
    renderMenuView();
    return;
  }
  const notifToggleBtn = e.target.closest('[data-notif-toggle]');
  if(notifToggleBtn){
    if(state.notifSubscribed) desactivarNotificaciones(); else activarNotificaciones();
    return;
  }
  const notifTestBtn = e.target.closest('[data-notif-test]');
  if(notifTestBtn){
    enviarPushPrueba();
    return;
  }
  const menuBackBtn = e.target.closest('[data-menu-back]');
  if(menuBackBtn){
    state.menuSection = null;
    state.editingCatId = null;
    state.editingMedioId = null;
    renderMenuView();
    return;
  }

  /* ---- Grupos (gastos compartidos) ---- */
  const grupoBackBtn = e.target.closest('[data-grupo-back]');
  if(grupoBackBtn){
    state.grupoAbiertoId = null; state.agregandoParticipante = false;
    renderGruposView();
    return;
  }
  const grupoAbrirBtn = e.target.closest('[data-grupo-abrir]');
  if(grupoAbrirBtn){
    state.grupoAbiertoId = grupoAbrirBtn.getAttribute('data-grupo-abrir');
    renderGruposView();
    return;
  }
  const grupoCrearAbrirBtn = e.target.closest('[data-grupo-crear-abrir]');
  if(grupoCrearAbrirBtn){
    state.creandoGrupo = true; state.grupoDraft = {nombre:'', icono:'👥'};
    renderGruposView();
    return;
  }
  const grupoCrearCancelarBtn = e.target.closest('[data-grupo-crear-cancelar]');
  if(grupoCrearCancelarBtn){
    state.creandoGrupo = false;
    renderGruposView();
    return;
  }
  const grupoDraftIconBtn = e.target.closest('[data-grupo-draft-icon]');
  if(grupoDraftIconBtn){
    state.grupoDraft.icono = grupoDraftIconBtn.getAttribute('data-grupo-draft-icon');
    renderGruposView();
    return;
  }
  const grupoCrearConfirmarBtn = e.target.closest('[data-grupo-crear-confirmar]');
  if(grupoCrearConfirmarBtn){
    const d = state.grupoDraft;
    if(d.nombre.trim()){
      crearGrupo(d.nombre.trim(), d.icono).then(function(g){
        state.creandoGrupo = false;
        toast(g ? 'Grupo "'+g.nombre+'" creado' : 'No se pudo crear el grupo — revisa tu conexión');
        renderGruposView();
      });
    }
    return;
  }
  const grupoUnirseAbrirBtn = e.target.closest('[data-grupo-unirse-abrir]');
  if(grupoUnirseAbrirBtn){
    state.uniendoAGrupo = true; state.joinDraft = {inviteCode:'', nombre:''};
    renderGruposView();
    return;
  }
  const grupoUnirseCancelarBtn = e.target.closest('[data-grupo-unirse-cancelar]');
  if(grupoUnirseCancelarBtn){
    state.uniendoAGrupo = false;
    renderGruposView();
    return;
  }
  const grupoUnirseConfirmarBtn = e.target.closest('[data-grupo-unirse-confirmar]');
  if(grupoUnirseConfirmarBtn){
    const d = state.joinDraft;
    if(d.inviteCode.trim() && d.nombre.trim()){
      unirseAGrupo(d.inviteCode.trim(), d.nombre.trim()).then(function(ok){
        state.uniendoAGrupo = false;
        toast(ok ? 'Te uniste al grupo' : 'No se pudo unir — revisa el código');
        renderGruposView();
      });
    }
    return;
  }
  const grupoAgregarParticipanteAbrirBtn = e.target.closest('[data-grupo-agregar-participante-abrir]');
  if(grupoAgregarParticipanteAbrirBtn){
    state.agregandoParticipante = true; state.participanteDraft = {nombre:''};
    renderGruposView();
    return;
  }
  const grupoAgregarParticipanteCancelarBtn = e.target.closest('[data-grupo-agregar-participante-cancelar]');
  if(grupoAgregarParticipanteCancelarBtn){
    state.agregandoParticipante = false;
    renderGruposView();
    return;
  }
  const grupoAgregarParticipanteConfirmarBtn = e.target.closest('[data-grupo-agregar-participante-confirmar]');
  if(grupoAgregarParticipanteConfirmarBtn){
    const gid = grupoAgregarParticipanteConfirmarBtn.getAttribute('data-grupo-agregar-participante-confirmar');
    const nombre = state.participanteDraft.nombre.trim();
    if(nombre){
      agregarParticipanteSinCuenta(gid, nombre, 'peach').then(function(p){
        state.agregandoParticipante = false;
        toast(p ? p.nombre+' se agregó al grupo' : 'No se pudo agregar — revisa tu conexión');
        renderGruposView();
      });
    }
    return;
  }
  const grupoSaldarBtn = e.target.closest('[data-grupo-saldar]');
  if(grupoSaldarBtn){
    const [gid, otroId] = grupoSaldarBtn.getAttribute('data-grupo-saldar').split('|');
    const mi = miParticipanteEnGrupo(gid);
    if(mi){
      const saldos = saldoGrupo(gid);
      const miSaldo = (saldos.find(s=>s.participanteId===mi.id)||{saldo:0}).saldo;
      const suSaldo = (saldos.find(s=>s.participanteId===otroId)||{saldo:0}).saldo;
      const monto = Math.min(Math.abs(miSaldo), Math.abs(suSaldo));
      if(monto>0){
        const promesa = (miSaldo<0 && suSaldo>0) ? registrarSaldoPagado(gid, mi.id, otroId, monto)
          : (miSaldo>0 && suSaldo<0) ? registrarSaldoPagado(gid, otroId, mi.id, monto) : Promise.resolve(false);
        promesa.then(function(ok){ toast(ok?'Cuenta saldada':'No se pudo registrar el saldo'); renderGruposView(); });
      }
    }
    return;
  }
  const compartirAbrirBtn = e.target.closest('[data-compartir-abrir]');
  if(compartirAbrirBtn){
    const txId = compartirAbrirBtn.getAttribute('data-compartir-abrir');
    state.compartirDraft = defaultCompartirDraft(txId);
    renderSheet();
    return;
  }
  const compartirCancelarBtn = e.target.closest('[data-compartir-cancelar]');
  if(compartirCancelarBtn){
    state.compartirDraft = null;
    renderSheet();
    return;
  }
  const compartirConfirmarBtn = e.target.closest('[data-compartir-confirmar]');
  if(compartirConfirmarBtn){
    const txId = compartirConfirmarBtn.getAttribute('data-compartir-confirmar');
    const d = state.compartirDraft;
    if(d && d.txId===txId && d.grupoId && d.pagadoPorId && d.participantesIncluidos.length>0){
      const t = getTx(txId);
      const reparto = repartirIguales(t ? t.monto : 0, d.participantesIncluidos);
      compartirTransaccionExistente(txId, d.grupoId, d.pagadoPorId, 'iguales', reparto).then(function(gasto){
        state.compartirDraft = null;
        toast(gasto ? 'Gasto compartido' : 'No se pudo compartir — revisa tu conexión');
        render();
      });
    }
    return;
  }

  const addCatBtn = e.target.closest('[data-add-cat]');
  if(addCatBtn){
    state.editingCatId = 'nueva';
    state.catDraft = {nombre:'', tipo:'gasto', color:'sage', icon:'🏷️'};
    renderMenuView();
    return;
  }
  const editCatBtn = e.target.closest('[data-edit-cat]');
  if(editCatBtn){
    const id = editCatBtn.getAttribute('data-edit-cat');
    const c = CATS[id];
    state.editingCatId = id;
    state.catDraft = {nombre:c.nombre, tipo:c.tipo, color:c.color, icon:c.icon};
    renderMenuView();
    return;
  }
  const cancelCatEditBtn = e.target.closest('[data-cancel-cat-edit]');
  if(cancelCatEditBtn){ state.editingCatId = null; renderMenuView(); return; }
  const catDraftIconBtn = e.target.closest('[data-cat-draft-icon]');
  if(catDraftIconBtn){ state.catDraft.icon = catDraftIconBtn.getAttribute('data-cat-draft-icon'); renderMenuView(); return; }
  const catDraftColorBtn = e.target.closest('[data-cat-draft-color]');
  if(catDraftColorBtn){ state.catDraft.color = catDraftColorBtn.getAttribute('data-cat-draft-color'); renderMenuView(); return; }
  const saveCatBtn = e.target.closest('[data-save-cat]');
  if(saveCatBtn){
    const idAttr = saveCatBtn.getAttribute('data-save-cat');
    const d = state.catDraft;
    if(!d.nombre.trim()){ toast('Ponle un nombre a la categoría'); return; }
    if(idAttr==='nueva'){
      CATS['cat_'+Date.now()] = {nombre:d.nombre.trim(), tipo:d.tipo, color:d.color, icon:d.icon};
      toast('Categoría creada');
    } else {
      CATS[idAttr].nombre = d.nombre.trim();
      CATS[idAttr].color = d.color;
      CATS[idAttr].icon = d.icon;
      toast('Categoría actualizada');
    }
    state.editingCatId = null;
    renderMenuView();
    return;
  }
  const deleteCatBtn = e.target.closest('[data-delete-cat]');
  if(deleteCatBtn){
    const id = deleteCatBtn.getAttribute('data-delete-cat');
    if(catEnUso(id)){ toast('No puedes eliminar una categoría con transacciones'); return; }
    delete CATS[id];
    delete PRESUPUESTOS[id];
    state.editingCatId = null;
    toast('Categoría eliminada');
    renderMenuView();
    return;
  }

  const addMedioBtn = e.target.closest('[data-add-medio]');
  if(addMedioBtn){
    state.editingMedioId = 'nueva';
    state.medioDraft = {nombre:'', corto:'', icon:'card'};
    renderMenuView();
    return;
  }
  const editMedioBtn = e.target.closest('[data-edit-medio]');
  if(editMedioBtn){
    const id = editMedioBtn.getAttribute('data-edit-medio');
    const m = MEDIOS[id];
    state.editingMedioId = id;
    state.medioDraft = {nombre:m.nombre, corto:m.corto, icon:m.icon};
    renderMenuView();
    return;
  }
  const cancelMedioEditBtn = e.target.closest('[data-cancel-medio-edit]');
  if(cancelMedioEditBtn){ state.editingMedioId = null; renderMenuView(); return; }
  const medioDraftIconBtn = e.target.closest('[data-medio-draft-icon]');
  if(medioDraftIconBtn){ state.medioDraft.icon = medioDraftIconBtn.getAttribute('data-medio-draft-icon'); renderMenuView(); return; }
  const saveMedioBtn = e.target.closest('[data-save-medio]');
  if(saveMedioBtn){
    const idAttr = saveMedioBtn.getAttribute('data-save-medio');
    const d = state.medioDraft;
    if(!d.nombre.trim()){ toast('Ponle un nombre al medio de pago'); return; }
    if(idAttr==='nueva'){
      MEDIOS['medio_'+Date.now()] = {nombre:d.nombre.trim(), corto:d.corto.trim(), icon:d.icon};
      toast('Medio de pago creado');
    } else {
      MEDIOS[idAttr].nombre = d.nombre.trim();
      MEDIOS[idAttr].corto = d.corto.trim();
      MEDIOS[idAttr].icon = d.icon;
      toast('Medio de pago actualizado');
    }
    state.editingMedioId = null;
    renderMenuView();
    return;
  }
  const deleteMedioBtn = e.target.closest('[data-delete-medio]');
  if(deleteMedioBtn){
    const id = deleteMedioBtn.getAttribute('data-delete-medio');
    if(medioEnUso(id)){ toast('No puedes eliminar un medio de pago con transacciones'); return; }
    delete MEDIOS[id];
    state.editingMedioId = null;
    toast('Medio de pago eliminado');
    renderMenuView();
    return;
  }

  const deleteReglaBtn = e.target.closest('[data-delete-regla]');
  if(deleteReglaBtn){
    const comercio = decodeURIComponent(deleteReglaBtn.getAttribute('data-delete-regla'));
    TX.forEach(t=>{ if(t.comercio===comercio) t.reglaAuto = false; });
    toast('Regla eliminada para '+comercio);
    renderMenuView();
    return;
  }

  const exportCsvBtn = e.target.closest('[data-export-csv]');
  if(exportCsvBtn){
    downloadFile('pitucas-sin-lucas-transacciones-'+todayISO()+'.csv', buildTransaccionesCSV(), 'text/csv;charset=utf-8;');
    toast('CSV descargado');
    return;
  }
  const exportJsonBtn = e.target.closest('[data-export-json]');
  if(exportJsonBtn){
    downloadFile('pitucas-sin-lucas-respaldo-'+todayISO()+'.json', buildBackupJSON(), 'application/json;charset=utf-8;');
    toast('Respaldo JSON descargado');
    return;
  }
  const importAgainBtn = e.target.closest('[data-import-again]');
  if(importAgainBtn){ state.importSummary = null; renderMenuView(); return; }

  const reconciliarReset = e.target.closest('[data-reconciliar-reset]');
  if(reconciliarReset){
    state.reconciliar = {archivo:null, cargando:false, error:null, tipo:null, movimientos:[], pagosTarjeta:null,
      disponibles: state.reconciliar.disponibles, usandoId:null, passwordDraft:'', errorPassword:null,
      archivoBuffer:null, archivoNombrePendiente:null};
    renderMenuView();
    return;
  }
  const reconciliarArchivoAbrir = e.target.closest('[data-reconciliar-archivo-abrir]');
  if(reconciliarArchivoAbrir){
    intentarAbrirArchivoCartola(state.reconciliar.archivoBuffer, state.reconciliar.archivoNombrePendiente, state.reconciliar.passwordDraft);
    return;
  }
  const reconciliarArchivoCancelar = e.target.closest('[data-reconciliar-archivo-cancelar]');
  if(reconciliarArchivoCancelar){
    state.reconciliar.archivoBuffer = null;
    state.reconciliar.archivoNombrePendiente = null;
    state.reconciliar.errorPassword = null;
    state.reconciliar.passwordDraft = '';
    renderMenuView();
    return;
  }
  const cartolaUsar = e.target.closest('[data-cartola-usar]');
  if(cartolaUsar){
    state.reconciliar.usandoId = cartolaUsar.getAttribute('data-cartola-usar');
    state.reconciliar.passwordDraft = '';
    state.reconciliar.errorPassword = null;
    renderMenuView();
    return;
  }
  const cartolaCancelar = e.target.closest('[data-cartola-cancelar]');
  if(cartolaCancelar){
    state.reconciliar.usandoId = null;
    state.reconciliar.errorPassword = null;
    renderMenuView();
    return;
  }
  const cartolaAbrir = e.target.closest('[data-cartola-abrir]');
  if(cartolaAbrir){
    usarCartolaImportada(cartolaAbrir.getAttribute('data-cartola-abrir'), state.reconciliar.passwordDraft);
    return;
  }
  const reconciliarAgregar = e.target.closest('[data-reconciliar-agregar]');
  if(reconciliarAgregar){
    const idx = parseInt(reconciliarAgregar.getAttribute('data-reconciliar-agregar'),10);
    const normales = state.reconciliar.movimientos.filter(function(m){ return m.esEspecial!=='pago_tarjeta' && m.esEspecial!=='pago_recibido'; });
    const m = normales[idx];
    if(m && !m.__match){
      crearTxDesdeMovimiento(m);
      m.__match = buscarTxParecida(m); // ahora sí calza (con la que se acaba de crear)
      renderMenuView();
      renderIfListVisible();
      toast('Transacción agregada');
    }
    return;
  }
  const reconciliarNoEsGasto = e.target.closest('[data-reconciliar-noesgasto]');
  if(reconciliarNoEsGasto){
    const idx = parseInt(reconciliarNoEsGasto.getAttribute('data-reconciliar-noesgasto'),10);
    const normales = state.reconciliar.movimientos.filter(function(m){ return m.esEspecial!=='pago_tarjeta' && m.esEspecial!=='pago_recibido'; });
    const m = normales[idx];
    if(m && !m.__match){
      crearTxDesdeMovimiento(m, {noEsGasto:true});
      m.__match = buscarTxParecida(m);
      renderMenuView();
      renderIfListVisible();
      toast('Agregada como "no es gasto"');
    }
    return;
  }
  const reconciliarAgregarTodo = e.target.closest('[data-reconciliar-agregar-todo]');
  if(reconciliarAgregarTodo){
    const normales = state.reconciliar.movimientos.filter(function(m){ return m.esEspecial!=='pago_tarjeta' && m.esEspecial!=='pago_recibido'; });
    let n = 0;
    normales.forEach(function(m){
      if(!m.__match){ crearTxDesdeMovimiento(m); m.__match = buscarTxParecida(m); n++; }
    });
    renderMenuView();
    renderIfListVisible();
    toast(n===1 ? 'Se agregó 1 transacción' : 'Se agregaron '+n+' transacciones');
    return;
  }
  const gotoPendientesBtn = e.target.closest('[data-goto-pendientes]');
  if(gotoPendientesBtn){
    state.filter = 'pendientes';
    state.tab = 'transacciones';
    render();
    return;
  }

  const toggleDemoBtn = e.target.closest('[data-toggle-demo]');
  if(toggleDemoBtn){
    state.demoMode = !state.demoMode;
    render();
    toast(state.demoMode ? 'Modo demo activado' : 'Modo demo desactivado');
    return;
  }
});

phone.addEventListener('change', function(e: any){
  const sel = e.target.closest('[data-cat-select]');
  if(sel){
    const t = getTx(state.openTxId);
    const idx = parseInt(sel.getAttribute('data-cat-select'),10);
    if(t){
      if(sel.value===''){
        // "Sin categoría": si es la única fila, la transacción queda sin clasificar (vuelve
        // a mostrarse la fila vacía); si hay más filas, se quita esta y su monto se suma a
        // la primera que quede — mismo criterio que el botón de borrar fila.
        if(t.categorias[idx]){
          const removedMonto = t.categorias[idx].monto;
          t.categorias.splice(idx,1);
          if(t.categorias[0]) t.categorias[0].monto += removedMonto;
        }
      } else if(t.categorias[idx]){
        t.categorias[idx].cat = sel.value;
      } else {
        t.categorias[idx] = {cat: sel.value, monto: t.monto};
      }
      renderSheet(); renderIfListVisible();
    }
    return;
  }
  const draftCatSelect = e.target.closest('[data-draft-cat-select]');
  if(draftCatSelect && state.draftTx){
    const val = draftCatSelect.value;
    state.draftTx.categorias = val ? [{cat: val, monto: state.draftTx.monto}] : [];
    renderSheet();
    return;
  }
  const draftMedio = e.target.closest('[data-draft-field="medio"]');
  if(draftMedio && state.draftTx){
    if(draftMedio.value==='__nuevo_medio__'){
      state.addingMedio = true;
      state.newMedioDraft = {nombre:'', ultimos4:''};
      renderSheet();
      setTimeout(()=>{ const el=document.querySelector<HTMLElement>('[data-new-medio-field="nombre"]'); if(el) el.focus(); }, 50);
      return;
    }
    state.draftTx.medio = draftMedio.value;
    return;
  }
  const txMedioSelect = e.target.closest('[data-tx-medio-select]');
  if(txMedioSelect){
    const t = getTx(txMedioSelect.getAttribute('data-tx-medio-select'));
    if(t){ t.medio = txMedioSelect.value; renderIfListVisible(); }
    return;
  }
  const compartirGrupoSelect = e.target.closest('[data-compartir-grupo]');
  if(compartirGrupoSelect && state.compartirDraft){
    state.compartirDraft = defaultCompartirDraft(state.compartirDraft.txId, compartirGrupoSelect.value);
    renderSheet();
    return;
  }
  const compartirIncluirBox = e.target.closest('[data-compartir-incluir]');
  if(compartirIncluirBox && state.compartirDraft){
    const pid = compartirIncluirBox.getAttribute('data-compartir-incluir');
    const d = state.compartirDraft;
    const idx = d.participantesIncluidos.indexOf(pid);
    if(compartirIncluirBox.checked && idx===-1) d.participantesIncluidos.push(pid);
    else if(!compartirIncluirBox.checked && idx!==-1) d.participantesIncluidos.splice(idx,1);
    renderSheet();
    return;
  }

  const filterDate = e.target.closest('[data-filter-date]');
  if(filterDate){
    const which = filterDate.getAttribute('data-filter-date');
    if(which==='from') state.advFilters.dateFrom = filterDate.value;
    else state.advFilters.dateTo = filterDate.value;
    return;
  }

  const csvFileInput = e.target.closest('[data-csv-file-input]');
  if(csvFileInput){
    const file = csvFileInput.files && csvFileInput.files[0];
    if(file){
      const reader = new FileReader();
      reader.onload = function(ev){
        const {rows, errors} = parseCartolaCSV(String(ev.target.result||''));
        const result = importCartolaRows(rows);
        state.importSummary = {archivo: file.name, errores: errors, creadas: result.creadas, conRegla: result.conRegla, pendientes: result.pendientes};
        renderMenuView();
        renderIfListVisible();
        toast(result.creadas+' transacciones importadas');
      };
      reader.readAsText(file, 'UTF-8');
    }
    return;
  }

  const reconciliarFileInput = e.target.closest('[data-reconciliar-file-input]');
  if(reconciliarFileInput){
    const file = reconciliarFileInput.files && reconciliarFileInput.files[0];
    if(file){
      state.reconciliar.passwordDraft = '';
      const reader = new FileReader();
      reader.onload = function(ev){
        intentarAbrirArchivoCartola(ev.target.result, file.name, '');
      };
      state.reconciliar.cargando = true;
      state.reconciliar.error = null;
      renderMenuView();
      reader.readAsArrayBuffer(file);
    }
    return;
  }
});

phone.addEventListener('input', function(e: any){
  const searchInput = e.target.closest('#tx-search-input');
  if(searchInput){
    state.searchQuery = searchInput.value;
    const clearBtn = document.getElementById('tx-search-clear');
    if(clearBtn) clearBtn.hidden = !state.searchQuery;
    renderTxResultsOnly();
    return;
  }
  const amtInput = e.target.closest('[data-cat-amount]');
  if(amtInput){
    const t = getTx(state.openTxId);
    const idx = parseInt(amtInput.getAttribute('data-cat-amount'),10);
    if(t && t.categorias[idx]){
      const unit = state.splitCatUnit[t.id] || '$';
      const v = safeEvalExpr(amtInput.value);
      if(v!==null){
        t.categorias[idx].monto = unit==='%' ? Math.round(t.monto * v/100) : Math.round(v);
        const catRowsWrap = amtInput.closest('.cat-rows');
        const remainingEl = catRowsWrap ? catRowsWrap.querySelector('.split-remaining span:last-child') : null;
        if(remainingEl){
          const sum = t.categorias.reduce((s,c)=>s+c.monto,0);
          const diff = t.monto - sum;
          remainingEl.textContent = money(diff);
          remainingEl.className = (Math.abs(diff)<1?'ok':'bad')+' tabular';
        }
      }
    }
    return;
  }
  const cobroAmt = e.target.closest('[data-cobro-amount]');
  if(cobroAmt){
    const t = getTx(state.openTxId);
    const idx = parseInt(cobroAmt.getAttribute('data-cobro-amount'),10);
    if(t){
      const unit = state.splitCobroUnit[t.id] || '$';
      const v = safeEvalExpr(cobroAmt.value);
      if(v!==null){
        t.porCobrar[idx].monto = unit==='%' ? Math.round(t.monto * v/100) : Math.round(v);
        const remainingEl = cobroAmt.closest('.split-block').querySelector('.split-remaining span:last-child');
        if(remainingEl){
          const totalCobro = porCobrarTotal(t);
          const tuParte = t.monto - totalCobro;
          remainingEl.textContent = money(tuParte);
          remainingEl.className = (tuParte<0?'bad':'ok')+' tabular';
        }
      }
    }
    return;
  }
  const cobroName = e.target.closest('[data-cobro-name]');
  if(cobroName){
    const t = getTx(state.openTxId);
    const idx = parseInt(cobroName.getAttribute('data-cobro-name'),10);
    if(t){ t.porCobrar[idx].persona = cobroName.value; }
    return;
  }
  const boletaItemNombre = e.target.closest('[data-boleta-item-nombre]');
  if(boletaItemNombre && state.boleta){
    const idx = parseInt(boletaItemNombre.getAttribute('data-boleta-item-nombre'),10);
    state.boleta.items[idx].nombre = boletaItemNombre.value;
    return;
  }
  const boletaItemMonto = e.target.closest('[data-boleta-item-monto]');
  if(boletaItemMonto && state.boleta){
    const idx = parseInt(boletaItemMonto.getAttribute('data-boleta-item-monto'),10);
    const v = safeEvalExpr(boletaItemMonto.value);
    if(v!==null){
      state.boleta.items[idx].monto = Math.round(v);
      const summaryEl = document.getElementById('boleta-totals-summary');
      if(summaryEl) summaryEl.innerHTML = renderBoletaItemsTotalsSummary();
      const continueBtn = document.querySelector<HTMLButtonElement>('[data-boleta-goto="asignar"]');
      if(continueBtn) continueBtn.disabled = !(state.boleta.items.length>0 && boletaTotal()>0);
    }
    return;
  }
  const boletaPropinaInput = e.target.closest('[data-boleta-propina-input]');
  if(boletaPropinaInput && state.boleta){
    state.boleta.propinaValor = boletaPropinaInput.value;
    const summaryEl = document.getElementById('boleta-totals-summary');
    if(summaryEl) summaryEl.innerHTML = renderBoletaItemsTotalsSummary();
    return;
  }
  // Editar Monto/Fecha/Hora de una transacción ya existente, desde el detalle — se actualiza
  // el dato de una y se refresca a mano el eco formateado y el encabezado (sin renderSheet()
  // completo, para no perder el foco del campo mientras se sigue escribiendo/eligiendo).
  const txFieldMonto = e.target.closest('[data-tx-field="monto"]');
  if(txFieldMonto){
    const tx = getTx(txFieldMonto.getAttribute('data-tx'));
    if(tx){
      tx.monto = parseInt(txFieldMonto.value.replace(/\D/g,''),10) || 0;
      const echoEl = txFieldMonto.closest('.edit-amount-row').querySelector('.edit-amount-echo');
      const txt = (tx.tipo==='ingreso'?'+':'')+money(tx.monto);
      if(echoEl) echoEl.textContent = txt;
      const headEl = document.querySelector('.sheet-amount');
      if(headEl) headEl.textContent = txt;
    }
    return;
  }
  const txFieldFecha = e.target.closest('[data-tx-field="fecha"]');
  if(txFieldFecha && txFieldFecha.value){
    const tx = getTx(txFieldFecha.getAttribute('data-tx'));
    if(tx){
      tx.fecha = txFieldFecha.value;
      ensureMonthExists(tx.fecha.slice(0,7));
      const hintEl = document.querySelector('.edit-day-hint');
      if(hintEl) hintEl.textContent = dayLabel(tx.fecha);
      const metaEl = document.querySelector('.sheet-top .meta');
      if(metaEl) metaEl.textContent = dayLabel(tx.fecha)+' · '+tx.hora+' · '+medioInfo(tx.medio).nombre;
    }
    return;
  }
  const txFieldHora = e.target.closest('[data-tx-field="hora"]');
  if(txFieldHora && txFieldHora.value){
    const tx = getTx(txFieldHora.getAttribute('data-tx'));
    if(tx){
      tx.hora = txFieldHora.value;
      const metaEl = document.querySelector('.sheet-top .meta');
      if(metaEl) metaEl.textContent = dayLabel(tx.fecha)+' · '+tx.hora+' · '+medioInfo(tx.medio).nombre;
    }
    return;
  }
  const txFieldNota = e.target.closest('[data-tx-field="nota"]');
  if(txFieldNota){
    const tx = getTx(txFieldNota.getAttribute('data-tx'));
    if(tx){
      tx.nota = txFieldNota.value;
      const notaEl = document.querySelector<HTMLElement>('.sheet-top [data-nota-echo]');
      if(notaEl){ notaEl.textContent = tx.nota; notaEl.style.display = tx.nota ? '' : 'none'; }
    }
    return;
  }
  const newMedioField = e.target.closest('[data-new-medio-field]');
  if(newMedioField){
    const field = newMedioField.getAttribute('data-new-medio-field');
    if(field==='nombre') state.newMedioDraft.nombre = newMedioField.value;
    else if(field==='ultimos4') state.newMedioDraft.ultimos4 = newMedioField.value.replace(/\D/g,'').slice(0,4);
    const saveNewBtn = document.querySelector<HTMLButtonElement>('[data-save-new-medio]');
    if(saveNewBtn) saveNewBtn.disabled = !state.newMedioDraft.nombre.trim();
    return;
  }

  const budgetMetaInput = e.target.closest('[data-budget-meta-input]');
  if(budgetMetaInput){
    state.budgetDraft.meta = budgetMetaInput.value;
    return;
  }
  const budgetTotalInput = e.target.closest('[data-budget-total-input]');
  if(budgetTotalInput){
    state.budgetTotalDraft = budgetTotalInput.value;
    return;
  }
  const metasGastoInput = e.target.closest('[data-metas-gasto-input]');
  if(metasGastoInput){
    state.metasGastoDraft[metasGastoInput.getAttribute('data-metas-gasto-input')] = metasGastoInput.value;
    return;
  }
  const datosTransferenciaInput = e.target.closest('[data-datos-transferencia-input]');
  if(datosTransferenciaInput){
    state.datosTransferenciaDraft[datosTransferenciaInput.getAttribute('data-datos-transferencia-input')] = datosTransferenciaInput.value;
    return;
  }
  const cartolaPasswordInput = e.target.closest('[data-cartola-password-input]');
  if(cartolaPasswordInput){
    state.reconciliar.passwordDraft = cartolaPasswordInput.value;
    return;
  }
  const metaField = e.target.closest('[data-meta-field]');
  if(metaField){
    state.metaDraft[metaField.getAttribute('data-meta-field')] = metaField.value;
    return;
  }
  const platformField = e.target.closest('[data-platform-field]');
  if(platformField){
    state.platformDraft[platformField.getAttribute('data-platform-field')] = platformField.value;
    return;
  }
  const newPlatformField = e.target.closest('[data-newplatform-field]');
  if(newPlatformField){
    state.newPlatformDraft[newPlatformField.getAttribute('data-newplatform-field')] = newPlatformField.value;
    return;
  }
  const catDraftField = e.target.closest('[data-cat-draft-field]');
  if(catDraftField){
    state.catDraft[catDraftField.getAttribute('data-cat-draft-field')] = catDraftField.value;
    return;
  }
  const medioDraftField = e.target.closest('[data-medio-draft-field]');
  if(medioDraftField){
    state.medioDraft[medioDraftField.getAttribute('data-medio-draft-field')] = medioDraftField.value;
    return;
  }
  const grupoDraftField = e.target.closest('[data-grupo-draft-field]');
  if(grupoDraftField){
    state.grupoDraft[grupoDraftField.getAttribute('data-grupo-draft-field')] = grupoDraftField.value;
    return;
  }
  const joinDraftField = e.target.closest('[data-join-draft-field]');
  if(joinDraftField){
    state.joinDraft[joinDraftField.getAttribute('data-join-draft-field')] = joinDraftField.value;
    return;
  }
  const participanteDraftField = e.target.closest('[data-participante-draft-field]');
  if(participanteDraftField){
    state.participanteDraft[participanteDraftField.getAttribute('data-participante-draft-field')] = participanteDraftField.value;
    return;
  }

  const planBaseInput = e.target.closest('[data-plan-base-input]');
  if(planBaseInput){
    PLANIFICADOR.base = parseInt(planBaseInput.value.replace(/\D/g,''),10) || 0;
    updatePlanCompute();
    return;
  }
  const planMetaPctInput = e.target.closest('[data-plan-meta-pct]');
  if(planMetaPctInput){
    const metaId = planMetaPctInput.getAttribute('data-plan-meta-id');
    const v = parseFloat(planMetaPctInput.value.replace(',','.'));
    PLANIFICADOR.metaPcts[metaId] = isNaN(v) ? 0 : v;
    updatePlanCompute();
    return;
  }
  const proyAporteInput = e.target.closest('[data-proy-aporte-input]');
  if(proyAporteInput){
    const raw = proyAporteInput.value.trim();
    // Vacío = "vuelve a usar tu promedio real" (mismo criterio que dejar el placeholder).
    state.proySimulatedAporte = raw==='' ? null : (parseInt(raw.replace(/\D/g,''),10) || 0);
    updateProyeccionCompute();
    return;
  }
  const proyRetornoInput = e.target.closest('[data-proy-retorno-input]');
  if(proyRetornoInput){
    const v = parseFloat(proyRetornoInput.value.replace(',','.'));
    PROYECCION_SUPUESTOS.retornoAnual = isNaN(v) ? 0 : v;
    updateProyeccionCompute();
    return;
  }
  const proyInflacionInput = e.target.closest('[data-proy-inflacion-input]');
  if(proyInflacionInput){
    const v = parseFloat(proyInflacionInput.value.replace(',','.'));
    PROYECCION_SUPUESTOS.inflacionAnual = isNaN(v) ? 0 : v;
    updateProyeccionCompute();
    return;
  }

  const draftField = e.target.closest('[data-draft-field]');
  if(draftField && state.draftTx){
    const field = draftField.getAttribute('data-draft-field');
    if(field==='comercio'){ state.draftTx.comercio = draftField.value; }
    else if(field==='fecha'){ state.draftTx.fecha = draftField.value; }
    else if(field==='monto'){
      const v = safeEvalExpr(draftField.value);
      if(v!==null){
        state.draftTx.monto = v;
        if(state.draftTx.categorias[0]) state.draftTx.categorias[0].monto = v;
      }
    }
    const saveBtn = document.querySelector<HTMLButtonElement>('[data-save-draft]');
    if(saveBtn) saveBtn.disabled = !(state.draftTx.comercio.trim().length>0 && state.draftTx.monto>0);
    return;
  }
});

// Normaliza los campos con expresiones (Tricount-style) al salir del input,
// así el usuario ve el número final en vez de la expresión que escribió.
phone.addEventListener('focusout', function(e: any){
  const amtInput = e.target.closest('[data-cat-amount]');
  if(amtInput){
    const t = getTx(state.openTxId);
    const idx = parseInt(amtInput.getAttribute('data-cat-amount'),10);
    if(t && t.categorias[idx]){
      const unit = state.splitCatUnit[t.id] || '$';
      const shown = unit==='%' ? (t.categorias[idx].monto/t.monto)*100 : t.categorias[idx].monto;
      amtInput.value = formatEditableNumber(shown);
    }
    return;
  }
  const cobroAmt = e.target.closest('[data-cobro-amount]');
  if(cobroAmt){
    const t = getTx(state.openTxId);
    const idx = parseInt(cobroAmt.getAttribute('data-cobro-amount'),10);
    if(t && t.porCobrar[idx].monto!=null){
      const unit = state.splitCobroUnit[t.id] || '$';
      const shown = unit==='%' ? (t.porCobrar[idx].monto/t.monto)*100 : t.porCobrar[idx].monto;
      cobroAmt.value = formatEditableNumber(shown);
    }
    return;
  }
  const draftMonto = e.target.closest('[data-draft-field="monto"]');
  if(draftMonto && state.draftTx){ draftMonto.value = state.draftTx.monto ? formatEditableNumber(state.draftTx.monto) : ''; return; }

  const boletaItemMontoOut = e.target.closest('[data-boleta-item-monto]');
  if(boletaItemMontoOut && state.boleta){
    const idx = parseInt(boletaItemMontoOut.getAttribute('data-boleta-item-monto'),10);
    const item = state.boleta.items[idx];
    if(item) boletaItemMontoOut.value = formatEditableNumber(item.monto);
    return;
  }

  const planBaseInput = e.target.closest('[data-plan-base-input]');
  if(planBaseInput){ planBaseInput.value = moneyPlain(PLANIFICADOR.base); return; }

  const boletaPropinaInputOut = e.target.closest('[data-boleta-propina-input]');
  if(boletaPropinaInputOut && state.boleta && state.boleta.propinaValor!==''){
    const v = safeEvalExpr(String(state.boleta.propinaValor));
    if(v!=null) boletaPropinaInputOut.value = state.boleta.propinaUnit==='%' ? String(v) : formatEditableNumber(v);
    return;
  }
});

document.addEventListener('keydown', function(e: any){
  if(e.key==='Escape' && (state.openTxId || state.creatingNew || state.filterSheetOpen || state.linkFlow || state.boleta)) closeSheet();
});

// Evita que el navegador haga scroll automático de la hoja al enfocar un botón
// (eso era lo que causaba el salto molesto al tocar acciones dentro del sheet).
phone.addEventListener('mousedown', function(e: any){
  const btn = e.target.closest('button');
  if(btn) e.preventDefault();
});

/* ---------- reordenar sub-tabs de Resumen con drag and drop ---------- */
// Funciona con mouse y con touch (Pointer Events unifica ambos). Un movimiento chico
// sigue siendo un tap normal (lo maneja el click de siempre); solo pasa a "drag" si
// el dedo/mouse se mueve más de un umbral, y ahí vamos reordenando en vivo mientras
// se arrastra, sin tocar el resto de la vista (#resumen-content sigue intacto).
export const SUBTAB_DRAG_THRESHOLD = 6;
phone.addEventListener('pointerdown', function(e: any){
  if(e.button!=null && e.button!==0) return;
  const pill = e.target.closest('[data-resumen-sub]');
  const container = document.getElementById('resumen-subtabs');
  if(!pill || !container) return;
  setSubtabDrag({
    id: pill.getAttribute('data-resumen-sub'),
    pointerId: e.pointerId,
    startX: e.clientX,
    dragging: false,
    container
  });
});
phone.addEventListener('pointermove', function(e: any){
  if(!subtabDrag || e.pointerId!==subtabDrag.pointerId) return;
  if(!subtabDrag.dragging){
    if(Math.abs(e.clientX - subtabDrag.startX) < SUBTAB_DRAG_THRESHOLD) return;
    subtabDrag.dragging = true;
    state.subtabDragId = subtabDrag.id;
    try{ subtabDrag.container.setPointerCapture(e.pointerId); }catch(err){}
    subtabDrag.container.innerHTML = renderResumenSubtabsInner();
  }
  e.preventDefault();
  const hovered = document.elementFromPoint(e.clientX, e.clientY);
  const hoveredPill = hovered && hovered.closest && hovered.closest('[data-resumen-sub]');
  if(!hoveredPill) return;
  const hoveredId = hoveredPill.getAttribute('data-resumen-sub');
  if(hoveredId===subtabDrag.id) return;
  const order = state.resumenSubOrder;
  const from = order.indexOf(subtabDrag.id);
  const to = order.indexOf(hoveredId);
  if(from===-1 || to===-1) return;
  order.splice(from,1);
  order.splice(to,0,subtabDrag.id);
  subtabDrag.container.innerHTML = renderResumenSubtabsInner();
});
export function endSubtabDrag(e){
  if(!subtabDrag || e.pointerId!==subtabDrag.pointerId) return;
  const wasDragging = subtabDrag.dragging;
  const container = subtabDrag.container;
  try{ container.releasePointerCapture(e.pointerId); }catch(err){}
  setSubtabDrag(null);
  state.subtabDragId = null;
  if(wasDragging){
    // El click (si el navegador llega a dispararlo) va sincrónico justo después de
    // pointerup/mouseup dentro del mismo gesto — con 0ms alcanza para dejarlo pasar
    // y no correr el riesgo de bloquear un tap real y posterior de la usuaria.
    setSuppressNextSubtabClick(true);
    setTimeout(function(){ setSuppressNextSubtabClick(false); }, 0);
    container.innerHTML = renderResumenSubtabsInner();
  }
}
phone.addEventListener('pointerup', endSubtabDrag);
phone.addEventListener('pointercancel', endSubtabDrag);

export function overlayEl(){ return document.getElementById('sheet-overlay'); }

export function renderIfListVisible(){
  if(state.tab==='transacciones') renderTransaccionesView();
  else if(state.tab==='resumen') renderResumenSubContent();
}
