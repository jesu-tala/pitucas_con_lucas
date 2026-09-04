import { allCollected, applyLockRule, catInfo, writeOffReceivable, dayLabel, paymentMethodInfo, pendingLinkedTo, receivableTotal, resolvePending, hasReceivableType } from './helpers';
import { render } from './render';
import { ensureMonthExists, formatEditableNumber, liveFormatThousands, regenerateInstallmentsFor, safeEvalExpr, safeEvalMoneyExpr, stripThousandsMarks, computeShareAmounts, shareAmountsSum, commitPersonaSplit, defaultPersonaSplitDraft, draftFromExistingSplit, participantsOfGroup } from './shared-expenses';
import { RECEIPT_EXAMPLES, receiptItemIdCounter, receiptTotal, closeSheet, getTx, saveReceipt, paymentMethodIdCounter, nextReceiptItemId, openReceiptFlow, openFilterSheet, openLinkFromIncome, openLinkFromPending, openNewTxSheet, openSheet, renderReceiptItemsTotalsSummary, renderSheet, saveDraftTx, setPaymentMethodIdCounter } from './sheet';
import { CATEGORIES, TRANSFER_INFO, PAYMENT_METHODS, SPENDING_GOAL_PCT, INVESTMENT_GOALS, TOTAL_GOAL_CHECKS, MONTHS, PLANNER, PLATFORM_DATA, BUDGETS, TRANSACTIONS, goalIdCounter, money, moneyPlain, monthlyBudgetTotal, setTransferInfo, setInvestmentGoals, setGoalIdCounter, setMonthlyBudgetTotal, setSubtabDrag, setSuppressNextSubtabClick, setTransactions, state, subtabDrag, suppressNextSubtabClick, todayISO } from './state';
import { handleLogout, switchAuthMode } from './supabase';
import { toast } from './ui/toasts';
import { PROJECTION_ASSUMPTIONS, goalsForPlatform, renderEvolutionView } from './views/evolucion';
import { defaultShareDraft, renderGroupsView } from './views/grupos';
import { activePlatformIds, generalCatIdFor, platformCurrentValue, platformIds, renderInvestmentsView, renderSummarySubContent, renderSummarySubtabsInner, renderSummaryView, updatePlanCompute, updateProyeccionCompute } from './views/inversiones';
import { absorbImportedRows, enableNotifications, addParticipantWithoutAccount, buildBackupJSON, buildChargeWhatsAppText, buildTransactionsCSV, findSimilarTx, loadAvailableStatements, isCategoryInUse, classifySharedExpenseFromOthers, shareExistingTransaction, createGroup, createTxFromMovement, transferInfoComplete, disableNotifications, downloadFile, deleteGroup, sendTestPush, importStatementRows, tryOpenStatementFile, loadEmailImportScreen, loadNotifStatus, isPaymentMethodInUse, parseStatementCSV, registerPaidBalance, renderMenuView, joinGroup, useImportedStatement } from './views/menu';
import { renderBudgetView } from './views/presupuesto';
import { openSalarySuggestionSheet, renderTransactionsView, renderTxResultsOnly } from './views/transacciones';
import { buildReconcileDiff } from './reconcile';
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
  const reloadEmailImportBtn = e.target.closest('[data-reload-email-import]');
  if(reloadEmailImportBtn){
    state.emailImportLoaded = false; state.emailImportError = null; state.emailImportLoading = true;
    renderMenuView();
    loadEmailImportScreen();
    return;
  }
  const askDeleteTxBtn = e.target.closest('[data-ask-delete-tx]');
  if(askDeleteTxBtn){ state.confirmDeleteTxId = askDeleteTxBtn.getAttribute('data-ask-delete-tx'); renderSheet(); return; }
  const cancelDeleteTxBtn = e.target.closest('[data-cancel-delete-tx]');
  if(cancelDeleteTxBtn){ state.confirmDeleteTxId = null; renderSheet(); return; }
  const confirmDeleteTxBtn = e.target.closest('[data-confirm-delete-tx]');
  if(confirmDeleteTxBtn){
    const delId = confirmDeleteTxBtn.getAttribute('data-confirm-delete-tx');
    setTransactions(TRANSACTIONS.filter(function(t){ return t.id!==delId; }));
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
    // we take advantage of the Transacciones tab being opened to check whether the Google
    // script left something new in the imported inbox and add it automatically, without the user having to go look for it
    if(state.tab==='transacciones') absorbImportedRows();
    return;
  }

  const filterBtn = e.target.closest('[data-filter]');
  if(filterBtn){ state.filter = filterBtn.getAttribute('data-filter'); render(); return; }

  const dismissSueldo = e.target.closest('[data-dismiss-salary-suggestion]');
  if(dismissSueldo){ state.salaryBannerDismissedMonth = todayISO().slice(0,7); renderTransactionsView(); return; }

  const confirmSueldo = e.target.closest('[data-confirm-salary-suggestion]');
  if(confirmSueldo){ openSalarySuggestionSheet(confirmSueldo.getAttribute('data-confirm-salary-suggestion')); return; }

  const clearCat = e.target.closest('[data-clear-catfilter]');
  if(clearCat){ state.categoryFilter=null; state.categoryFilterMonth=null; render(); return; }

  const clearSearch = e.target.closest('[data-clear-search]');
  if(clearSearch){ state.searchQuery=''; renderTransactionsView(); return; }

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
  const toggleFilterMedio = e.target.closest('[data-toggle-filter-payment-method]');
  if(toggleFilterMedio){
    const mid = toggleFilterMedio.getAttribute('data-toggle-filter-payment-method');
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
    renderTransactionsView();
    return;
  }

  const subBtn = e.target.closest('[data-summary-sub]');
  if(subBtn){ state.summarySub = subBtn.getAttribute('data-summary-sub'); renderSummaryView(); return; }

  const monthNav = e.target.closest('[data-month-nav]');
  if(monthNav && !monthNav.disabled){
    const d = parseInt(monthNav.getAttribute('data-month-nav'),10);
    state.monthIndex = Math.max(0, Math.min(MONTHS.length-1, state.monthIndex+d));
    renderSummarySubContent();
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
      state.draftTx.categorias = []; // the category depends on the type, so it gets reset
      renderSheet();
      return;
    }
    if(group==='draft-recurrencia' && state.draftTx){
      state.draftTx.recurrencia = val;
      renderSheet();
      return;
    }
    if(group==='meta-plazo'){
      state.goalDraft.plazo = val;
      renderInvestmentsView();
      return;
    }
    if(group==='platform-plazo'){
      state.platformDraft.plazo = val;
      renderInvestmentsView();
      return;
    }
    if(group==='newplatform-plazo'){
      state.newPlatformDraft.plazo = val;
      renderInvestmentsView();
      return;
    }
    if(group==='cat-draft-tipo'){
      state.catDraft.tipo = val;
      renderMenuView();
      return;
    }
    if(group==='compartir-pagador' && state.shareDraft){
      state.shareDraft.pagadoPorId = val;
      renderSheet();
      return;
    }
    if(group==='division-tipo' && state.shareDraft){
      const d = state.shareDraft;
      const tipoAnterior = d.divisionTipo;
      d.divisionTipo = val;
      // Seed each included participant's custom value from whatever the PREVIOUS modality was
      // actually showing (its real computed split, "por partes" included -- not forced equal) so
      // switching to "%"/"monto fijo" doesn't start everyone at a blank/zero — nice starting point
      // to fine-tune rather than type from scratch (only fills in blanks, never overwrites
      // something the user already typed if they flip back and forth between modalities).
      if(val!=='iguales'){
        const t = getTx(d.txId);
        if(t){
          const base = computeShareAmounts(t.monto, {...d, divisionTipo: tipoAnterior});
          d.participantesIncluidos.forEach(id=>{
            if(d.customValues[id]==null || d.customValues[id]===''){
              d.customValues[id] = val==='pct'
                ? String(t.monto ? Math.round((base[id]||0)/t.monto*1000)/10 : 0)
                : String(base[id]||0);
            }
          });
        }
      }
      renderSheet();
      return;
    }
    const t = getTx(state.openTxId);
    if(t){
      if(group==='tipo' && t.tipo!==val){
        // The category depends on the type (gasto/ingreso/inversion use different category
        // lists) — same as when creating a new transaction, it gets reset so as not to leave
        // an "orphaned" category that no longer matches this type. That used to make Balance
        // count wrong: an expense transaction with an old category from another type would
        // sneak in (or get lost) in the category breakdown.
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
      if(t.sharedByOthers){
        // Group expense that someone else registered: besides classifying this transaction,
        // this learns the "their category -> mine" mapping so future expenses like this get
        // classified automatically (see classifySharedExpenseFromOthers).
        classifySharedExpenseFromOthers(t.id, catId).then(function(){
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

  const toggleCuotas = e.target.closest('[data-toggle-installments]');
  if(toggleCuotas){
    const t = getTx(toggleCuotas.getAttribute('data-toggle-installments'));
    if(t){
      if(t.cuotas){ delete t.cuotas; } else { t.cuotas = {total:2}; }
      regenerateInstallmentsFor(t.id);
      renderSheet(); renderIfListVisible();
    }
    return;
  }
  const cuotasStep = e.target.closest('[data-installments-step]');
  if(cuotasStep){
    const t = getTx(cuotasStep.getAttribute('data-tx'));
    if(t && t.cuotas){
      const delta = parseInt(cuotasStep.getAttribute('data-installments-step'),10);
      t.cuotas.total = Math.max(2, Math.min(24, t.cuotas.total+delta));
      regenerateInstallmentsFor(t.id);
      renderSheet(); renderIfListVisible();
    }
    return;
  }

  const paidBtn = e.target.closest('[data-toggle-paid]');
  if(paidBtn){
    const t = getTx(state.openTxId);
    const idx = parseInt(paidBtn.getAttribute('data-toggle-paid'),10);
    if(t && t.porCobrar[idx]){
      t.porCobrar[idx].pagado = !t.porCobrar[idx].pagado;
      if(allCollected(t)) toast('¡Ya te pagaron todo!');
      renderSheet(); renderIfListVisible();
    }
    return;
  }

  const saveDraftBtn = e.target.closest('[data-save-draft]');
  if(saveDraftBtn && !saveDraftBtn.disabled){
    const grupoIdOrigen = state.createExpenseFromGroupId;
    const tx = saveDraftTx();
    if(tx && grupoIdOrigen){
      // saveDraftTx() already left the sheet open on this transaction's detail -- here we
      // preload "Compartir con un grupo" with the group we came from, so the user isn't
      // forced to pick it again.
      state.createExpenseFromGroupId = null;
      state.shareDraft = defaultShareDraft(tx.id, grupoIdOrigen);
      renderSheet();
      toast('Transacción agregada — completa el reparto abajo');
    }
    return;
  }

  const cancelNewMedio = e.target.closest('[data-cancel-new-payment-method]');
  if(cancelNewMedio){
    state.addingPaymentMethod = false;
    renderSheet();
    return;
  }
  const saveNewMedio = e.target.closest('[data-save-new-payment-method]');
  if(saveNewMedio && !saveNewMedio.disabled){
    const nombre = state.newPaymentMethodDraft.nombre.trim();
    if(nombre && state.draftTx){
      setPaymentMethodIdCounter(paymentMethodIdCounter+1);
      const key = 'custom_'+paymentMethodIdCounter;
      const ultimos4 = state.newPaymentMethodDraft.ultimos4.trim();
      PAYMENT_METHODS[key] = {nombre, corto: ultimos4 ? '•••• '+ultimos4 : nombre, icon:'card'};
      state.draftTx.medio = key;
      state.addingPaymentMethod = false;
      state.newPaymentMethodDraft = {nombre:'', ultimos4:''};
      toast('Tarjeta agregada: '+nombre);
      renderSheet();
    }
    return;
  }

  const editBudgetBtn = e.target.closest('[data-edit-budget]');
  if(editBudgetBtn){
    const catId = editBudgetBtn.getAttribute('data-edit-budget');
    const cfg = BUDGETS[catId];
    state.editingBudgetCat = catId;
    state.budgetDraft = cfg
      ? {meta:String(cfg.meta), alertas:Object.assign({},cfg.alertas)}
      : {meta:'', alertas:{80:true,90:true,100:true}};
    renderBudgetView();
    return;
  }
  const cancelBudgetEdit = e.target.closest('[data-cancel-budget-edit]');
  if(cancelBudgetEdit){
    state.editingBudgetCat = null;
    renderBudgetView();
    return;
  }
  const toggleAlert = e.target.closest('[data-toggle-alert]');
  if(toggleAlert){
    const t = toggleAlert.getAttribute('data-toggle-alert');
    state.budgetDraft.alertas[t] = !state.budgetDraft.alertas[t];
    renderBudgetView();
    return;
  }
  const saveBudget = e.target.closest('[data-save-budget]');
  if(saveBudget){
    const catId = saveBudget.getAttribute('data-save-budget');
    const meta = safeEvalExpr(state.budgetDraft.meta);
    if(meta!==null && meta>0){
      BUDGETS[catId] = {meta: Math.round(meta), alertas: Object.assign({},state.budgetDraft.alertas)};
      state.editingBudgetCat = null;
      toast('Presupuesto guardado: '+catInfo(catId).nombre);
      renderBudgetView();
    } else {
      toast('Pon una meta mensual válida');
    }
    return;
  }
  const deleteBudget = e.target.closest('[data-delete-budget]');
  if(deleteBudget){
    const catId = deleteBudget.getAttribute('data-delete-budget');
    delete BUDGETS[catId];
    state.editingBudgetCat = null;
    toast('Presupuesto eliminado');
    renderBudgetView();
    return;
  }
  const budgetVerMas = e.target.closest('[data-budget-see-more]');
  if(budgetVerMas){
    const catId = budgetVerMas.getAttribute('data-budget-see-more');
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
    state.budgetTotalDraft = String(monthlyBudgetTotal);
    renderBudgetView();
    return;
  }
  const cancelBudgetTotal = e.target.closest('[data-cancel-budget-total]');
  if(cancelBudgetTotal){
    state.editingBudgetTotal = false;
    renderBudgetView();
    return;
  }
  const saveBudgetTotal = e.target.closest('[data-save-budget-total]');
  if(saveBudgetTotal){
    const v = safeEvalExpr(state.budgetTotalDraft);
    if(v!==null && v>0){
      setMonthlyBudgetTotal(Math.round(v));
      state.editingBudgetTotal = false;
      toast('Presupuesto total actualizado');
      renderBudgetView();
    } else {
      toast('Pon un presupuesto total válido');
    }
    return;
  }

  const editMetasGasto = e.target.closest('[data-edit-spending-goals]');
  if(editMetasGasto){
    state.editingSpendingGoals = true;
    state.spendingGoalsDraft = {fijo:String(SPENDING_GOAL_PCT.fijo), variable:String(SPENDING_GOAL_PCT.variable)};
    renderBudgetView();
    return;
  }
  const cancelMetasGasto = e.target.closest('[data-cancel-spending-goals]');
  if(cancelMetasGasto){
    state.editingSpendingGoals = false;
    renderBudgetView();
    return;
  }
  const saveMetasGasto = e.target.closest('[data-save-spending-goals]');
  if(saveMetasGasto){
    const fijo = safeEvalExpr(state.spendingGoalsDraft.fijo);
    const variable = safeEvalExpr(state.spendingGoalsDraft.variable);
    if(fijo!==null && fijo>=0 && variable!==null && variable>=0){
      SPENDING_GOAL_PCT.fijo = Math.round(fijo);
      SPENDING_GOAL_PCT.variable = Math.round(variable);
      state.editingSpendingGoals = false;
      toast('Metas actualizadas');
      renderBudgetView();
    } else {
      toast('Pon valores válidos para Fijo y Variable');
    }
    return;
  }

  const editDatosTransferencia = e.target.closest('[data-edit-transfer-info]');
  if(editDatosTransferencia){
    state.editingTransferInfo = true;
    state.transferInfoDraft = Object.assign({}, TRANSFER_INFO);
    renderMenuView();
    return;
  }
  const cancelDatosTransferencia = e.target.closest('[data-cancel-transfer-info]');
  if(cancelDatosTransferencia){
    state.editingTransferInfo = false;
    renderMenuView();
    return;
  }
  const saveDatosTransferencia = e.target.closest('[data-save-transfer-info]');
  if(saveDatosTransferencia){
    setTransferInfo(Object.assign({}, state.transferInfoDraft));
    Object.keys(TRANSFER_INFO).forEach(k=>{ TRANSFER_INFO[k] = (TRANSFER_INFO[k]||'').trim(); });
    state.editingTransferInfo = false;
    toast('Datos de transferencia guardados');
    renderMenuView();
    return;
  }

  const copyChargeBtn = e.target.closest('[data-copy-charge]');
  if(copyChargeBtn){
    const t = getTx(copyChargeBtn.getAttribute('data-copy-charge'));
    const txt = t ? buildChargeWhatsAppText(t) : null;
    if(!txt){ toast('No hay cobros pendientes para copiar'); return; }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){
        toast(transferInfoComplete() ? 'Copiado — listo para pegar en WhatsApp' : 'Copiado — agrega tus datos de transferencia en Menú > Mi cuenta para incluirlos');
      }).catch(function(){ toast('No se pudo copiar'); });
    } else {
      toast('No se pudo copiar');
    }
    return;
  }

  const evoMonthGroup = e.target.closest('[data-evo-month]');
  if(evoMonthGroup){
    state.evolutionSelectedMonth = evoMonthGroup.getAttribute('data-evo-month');
    renderEvolutionView();
    return;
  }
  const editGoalBtn = e.target.closest('[data-edit-goal]');
  if(editGoalBtn){
    const id = editGoalBtn.getAttribute('data-edit-goal');
    const meta = INVESTMENT_GOALS.find(m=>m.id===id);
    state.editingGoalId = id;
    state.goalDraft = meta
      ? {nombre:meta.nombre, montoObjetivo:String(meta.montoObjetivo), aporteMensualMeta:String(meta.aporteMensualMeta), aportadoInicial:String(meta.startingAmount||0), mesInicio:meta.startMonth||todayISO().slice(0,7), plazo:meta.plazo||'', comision:meta.comision!=null?String(meta.comision):''}
      : {nombre:'', montoObjetivo:'', aporteMensualMeta:'', aportadoInicial:'', mesInicio:todayISO().slice(0,7), plazo:'', comision:''};
    renderInvestmentsView();
    return;
  }
  const addGoalBtn = e.target.closest('[data-add-goal]');
  if(addGoalBtn){
    state.editingGoalId = 'nueva';
    state.addGoalPlatformId = addGoalBtn.getAttribute('data-add-goal');
    state.goalDraft = {nombre:'', montoObjetivo:'', aporteMensualMeta:'', aportadoInicial:'', mesInicio:todayISO().slice(0,7), plazo:'', comision:''};
    renderInvestmentsView();
    return;
  }
  const cancelMetaEdit = e.target.closest('[data-cancel-goal-edit]');
  if(cancelMetaEdit){
    state.editingGoalId = null;
    state.addGoalPlatformId = null;
    renderInvestmentsView();
    return;
  }
  const saveGoalBtn = e.target.closest('[data-save-goal]');
  if(saveGoalBtn){
    const id = saveGoalBtn.getAttribute('data-save-goal');
    const nombre = state.goalDraft.nombre.trim();
    const objetivo = safeEvalExpr(state.goalDraft.montoObjetivo);
    const aporte = safeEvalExpr(state.goalDraft.aporteMensualMeta);
    const comisionRaw = state.goalDraft.comision.trim();
    const comisionVal = comisionRaw==='' ? null : safeEvalExpr(comisionRaw);
    const comisionFinal = (comisionRaw!=='' && comisionVal!==null) ? comisionVal : null;
    // "Aportado hasta ahora" (the seed for money put in before this goal was tracked here) and
    // "mes de inicio" (which month it starts counting transactions from) -- both optional-ish:
    // an empty/invalid value falls back to 0 / the current month, same forgiving behavior the
    // rest of the numeric drafts in this app already have.
    const aportadoInicialRaw = state.goalDraft.aportadoInicial.trim();
    const aportadoInicialVal = aportadoInicialRaw==='' ? 0 : safeEvalExpr(aportadoInicialRaw);
    const startingAmount = (aportadoInicialVal!==null && aportadoInicialVal>=0) ? Math.round(aportadoInicialVal) : 0;
    const mesInicioRaw = (state.goalDraft.mesInicio||'').trim();
    const startMonth = /^\d{4}-\d{2}$/.test(mesInicioRaw) ? mesInicioRaw : todayISO().slice(0,7);
    if(nombre && objetivo!==null && objetivo>0 && aporte!==null && aporte>=0){
      if(id==='nueva'){
        setGoalIdCounter(goalIdCounter+1);
        const newId = 'm'+goalIdCounter;
        INVESTMENT_GOALS.push({id:newId, nombre, montoObjetivo:Math.round(objetivo), aporteMensualMeta:Math.round(aporte), plataformaId:state.addGoalPlatformId, plazo:state.goalDraft.plazo||null, comision:comisionFinal, startMonth, startingAmount, checks:{}});
        toast('Meta creada: '+nombre);
      } else {
        const meta = INVESTMENT_GOALS.find(m=>m.id===id);
        if(meta){ meta.nombre = nombre; meta.montoObjetivo = Math.round(objetivo); meta.aporteMensualMeta = Math.round(aporte); meta.plazo = state.goalDraft.plazo||null; meta.comision = comisionFinal; meta.startMonth = startMonth; meta.startingAmount = startingAmount; }
        toast('Meta actualizada');
      }
      state.editingGoalId = null;
      state.addGoalPlatformId = null;
      renderInvestmentsView();
    } else {
      toast('Completa nombre, objetivo y aporte meta válidos');
    }
    return;
  }
  const deleteGoalBtn = e.target.closest('[data-delete-goal]');
  if(deleteGoalBtn){
    const id = deleteGoalBtn.getAttribute('data-delete-goal');
    setInvestmentGoals(INVESTMENT_GOALS.filter(m=>m.id!==id));
    state.editingGoalId = null;
    toast('Meta eliminada');
    renderInvestmentsView();
    return;
  }
  // "No tienes metas creadas" empty state, shown instead of the category picker when
  // classifying an investment-type transaction and INVESTMENT_GOALS is still empty (there's
  // nowhere meaningful to categorize it to yet) -- jumps straight into Inversiones with "new
  // goal" already open, pre-selecting whichever platform the button carries (the platform whose
  // General option would've been closest in the list, or the first active one as a fallback).
  // The in-progress transaction/draft is closed along the way (same as any other navigation
  // away from the sheet) -- there's no autosave for a half-filled draft elsewhere in the app
  // either, so this doesn't lose anything that wasn't already recoverable by reopening it.
  const gotoCreateGoalBtn = e.target.closest('[data-goto-create-goal]');
  if(gotoCreateGoalBtn){
    const platId = gotoCreateGoalBtn.getAttribute('data-goto-create-goal') || activePlatformIds()[0] || platformIds()[0];
    closeSheet();
    state.tab = 'resumen';
    state.summarySub = 'inversiones';
    if(platId){
      state.openPlatformId = platId;
      state.editingGoalId = 'nueva';
      state.addGoalPlatformId = platId;
      state.goalDraft = {nombre:'', montoObjetivo:'', aporteMensualMeta:'', aportadoInicial:'', mesInicio:todayISO().slice(0,7), plazo:'', comision:''};
      toast('Crea tu meta y vuelve a clasificar esta transacción');
    } else {
      toast('Primero agrega una plataforma de inversión');
    }
    render();
    return;
  }
  const toggleMetaCheck = e.target.closest('[data-toggle-goal-check]');
  if(toggleMetaCheck){
    const id = toggleMetaCheck.getAttribute('data-toggle-goal-check');
    const mk = toggleMetaCheck.getAttribute('data-toggle-goal-month');
    const meta = INVESTMENT_GOALS.find(m=>m.id===id);
    if(meta){ meta.checks[mk] = !meta.checks[mk]; renderInvestmentsView(); }
    return;
  }
  const toggleMetaTotalCheck = e.target.closest('[data-toggle-goal-total-check]');
  if(toggleMetaTotalCheck){
    const mk = toggleMetaTotalCheck.getAttribute('data-toggle-goal-total-check');
    TOTAL_GOAL_CHECKS[mk] = !TOTAL_GOAL_CHECKS[mk];
    renderInvestmentsView();
    return;
  }

  const togglePlatformBtn = e.target.closest('[data-toggle-platform]');
  if(togglePlatformBtn){
    const id = togglePlatformBtn.getAttribute('data-toggle-platform');
    state.openPlatformId = (state.openPlatformId===id) ? null : id;
    renderInvestmentsView();
    return;
  }

  const editPlatformBtn = e.target.closest('[data-edit-platform]');
  if(editPlatformBtn){
    const id = editPlatformBtn.getAttribute('data-edit-platform');
    state.editingPlatformId = id;
    state.confirmDeletePlatformId = null;
    state.confirmArchivePlatformId = null;
    state.platformDraft = {
      valor: String(platformCurrentValue(id)),
      tasaAnual: PLATFORM_DATA[id].tasaAnual!=null ? String(PLATFORM_DATA[id].tasaAnual) : '',
      comision: PLATFORM_DATA[id].comision!=null ? String(PLATFORM_DATA[id].comision) : '',
      plazo: PLATFORM_DATA[id].plazo || ''
    };
    renderInvestmentsView();
    return;
  }
  const cancelPlatformEdit = e.target.closest('[data-cancel-platform-edit]');
  if(cancelPlatformEdit){
    state.editingPlatformId = null;
    state.confirmDeletePlatformId = null;
    state.confirmArchivePlatformId = null;
    renderInvestmentsView();
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
      PLATFORM_DATA[id].valorHistorial[mesActual] = Math.round(valor);
      PLATFORM_DATA[id].fechaActualizacion = todayISO();
      PLATFORM_DATA[id].tasaAnual = (tasaRaw!=='' && tasa!==null) ? tasa : null;
      PLATFORM_DATA[id].comision = (comisionRaw!=='' && comisionVal!==null) ? comisionVal : null;
      PLATFORM_DATA[id].plazo = state.platformDraft.plazo || null;
      state.editingPlatformId = null;
      toast('Valor actualizado: '+catInfo(id).nombre);
      renderInvestmentsView();
    } else {
      toast('Pon un valor válido');
    }
    return;
  }
  const deletePlatformBtn = e.target.closest('[data-delete-platform]');
  if(deletePlatformBtn){
    const id = deletePlatformBtn.getAttribute('data-delete-platform');
    if(isCategoryInUse(id) || isCategoryInUse(generalCatIdFor(id))){ toast('No puedes eliminar una plataforma con transacciones'); return; }
    if(goalsForPlatform(id).length>0){ toast('Elimina primero sus metas'); return; }
    state.confirmDeletePlatformId = id;
    renderInvestmentsView();
    return;
  }
  const cancelDeletePlatformBtn = e.target.closest('[data-cancel-delete-platform]');
  if(cancelDeletePlatformBtn){
    state.confirmDeletePlatformId = null;
    renderInvestmentsView();
    return;
  }
  const confirmDeletePlatformBtn = e.target.closest('[data-confirm-delete-platform]');
  if(confirmDeletePlatformBtn){
    const id = confirmDeletePlatformBtn.getAttribute('data-confirm-delete-platform');
    if(isCategoryInUse(id) || isCategoryInUse(generalCatIdFor(id))){ toast('No puedes eliminar una plataforma con transacciones'); return; }
    if(goalsForPlatform(id).length>0){ toast('Elimina primero sus metas'); return; }
    const nombre = catInfo(id).nombre;
    delete CATEGORIES[id];          // this also removes it from Menú > Categorías, which only lists what's in CATEGORIES
    delete PLATFORM_DATA[id];
    state.editingPlatformId = null;
    state.confirmDeletePlatformId = null;
    toast('Plataforma eliminada: '+nombre);
    renderInvestmentsView();
    return;
  }
  const archivePlatformBtn = e.target.closest('[data-archive-platform]');
  if(archivePlatformBtn){
    const id = archivePlatformBtn.getAttribute('data-archive-platform');
    if(goalsForPlatform(id).length>0){ toast('Elimina primero sus metas'); return; }
    state.confirmArchivePlatformId = id;
    renderInvestmentsView();
    return;
  }
  const cancelArchivePlatformBtn = e.target.closest('[data-cancel-archive-platform]');
  if(cancelArchivePlatformBtn){
    state.confirmArchivePlatformId = null;
    renderInvestmentsView();
    return;
  }
  const confirmArchivePlatformBtn = e.target.closest('[data-confirm-archive-platform]');
  if(confirmArchivePlatformBtn){
    const id = confirmArchivePlatformBtn.getAttribute('data-confirm-archive-platform');
    if(goalsForPlatform(id).length>0){ toast('Elimina primero sus metas'); return; }
    PLATFORM_DATA[id].archivada = true;
    state.editingPlatformId = null;
    state.confirmArchivePlatformId = null;
    toast('Plataforma cerrada: '+catInfo(id).nombre);
    renderInvestmentsView();
    return;
  }
  const reopenPlatformBtn = e.target.closest('[data-reopen-platform]');
  if(reopenPlatformBtn){
    const id = reopenPlatformBtn.getAttribute('data-reopen-platform');
    PLATFORM_DATA[id].archivada = false;
    toast('Plataforma reabierta: '+catInfo(id).nombre);
    renderInvestmentsView();
    return;
  }

  const addPlatformBtn = e.target.closest('[data-add-platform]');
  if(addPlatformBtn){
    state.creatingPlatform = true;
    state.newPlatformDraft = {nombre:'', icon:'bank', color:'butter', valor:'', plazo:''};
    renderInvestmentsView();
    return;
  }
  const cancelNewPlatformBtn = e.target.closest('[data-cancel-newplatform]');
  if(cancelNewPlatformBtn){
    state.creatingPlatform = false;
    renderInvestmentsView();
    return;
  }
  const newPlatformIconBtn = e.target.closest('[data-newplatform-icon]');
  if(newPlatformIconBtn){ state.newPlatformDraft.icon = newPlatformIconBtn.getAttribute('data-newplatform-icon'); renderInvestmentsView(); return; }
  const newPlatformColorBtn = e.target.closest('[data-newplatform-color]');
  if(newPlatformColorBtn){ state.newPlatformDraft.color = newPlatformColorBtn.getAttribute('data-newplatform-color'); renderInvestmentsView(); return; }
  const saveNewPlatformBtn = e.target.closest('[data-save-newplatform]');
  if(saveNewPlatformBtn){
    const d = state.newPlatformDraft;
    if(!d.nombre.trim()){ toast('Ponle un nombre a la plataforma'); return; }
    const valor = d.valor.trim()==='' ? 0 : safeEvalExpr(d.valor);
    if(valor===null || valor<0){ toast('Pon un valor válido (o déjalo en 0)'); return; }
    const id = 'plataforma_'+Date.now();
    CATEGORIES[id] = {nombre:d.nombre.trim(), tipo:'inversion', color:d.color, icon:d.icon};
    // all existing months are filled in with the same initial value (a flat line before it was
    // created) so as not to break the shared "Aportado vs. valor mes a mes" chart, which only
    // graphs months where ALL platforms have data.
    const valorHistorial = {};
    MONTHS.forEach(m=>{ valorHistorial[m] = Math.round(valor); });
    PLATFORM_DATA[id] = {valorHistorial, fechaActualizacion: todayISO(), tasaAnual:null, comision:null, plazo: d.plazo || null};
    state.creatingPlatform = false;
    toast('Plataforma agregada: '+d.nombre.trim());
    renderInvestmentsView();
    return;
  }

  const platformVerMas = e.target.closest('[data-platform-see-more]');
  if(platformVerMas){
    const id = platformVerMas.getAttribute('data-platform-see-more');
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
        // 3-way toggle: no split at all -> opens the shared split draft (see
        // defaultPersonaSplitDraft/renderSplitDraftForm) so choosing who's in it and how it's
        // divided always goes through the same hard-validated picker, never a guessed row ->
        // draft open but not yet confirmed -> cancels it -> a split already committed -> removes it.
        const draftAbierto = !!(state.shareDraft && state.shareDraft.txId===t.id && !state.shareDraft.groupId);
        if(hasReceivableType(t,'persona')){
          // it was already marked — pressing again deselects it (only removes the rows of
          // this type; if no pending charge/reimbursement is left, it goes back to confirmado).
          t.porCobrar = t.porCobrar.filter(p=>p.tipo!=='persona');
          delete t.pagador; delete t.divisionTipo;
          state.shareDraft = null;
          if(t.porCobrar.length===0){ t.estado = t.categorias.length>0 ? 'confirmado' : 'pendiente'; state.splitCollectMode[t.id]=false; }
          toast('Se quitó el cobro pendiente');
        } else if(draftAbierto){
          state.shareDraft = null;
          if(t.porCobrar.length===0){ t.estado = t.categorias.length>0 ? 'confirmado' : 'pendiente'; state.splitCollectMode[t.id]=false; }
          toast('Se canceló el reparto');
        } else {
          t.estado='por_cobrar'; state.splitCollectMode[t.id]=true;
          state.shareDraft = defaultPersonaSplitDraft(t.id);
          toast('Elige con quién divides este gasto');
        }
      }
      else if(act==='porcobrar_reembolso'){
        if(hasReceivableType(t,'reembolso')){
          t.porCobrar = t.porCobrar.filter(p=>p.tipo!=='reembolso');
          if(t.porCobrar.length===0){ t.estado = t.categorias.length>0 ? 'confirmado' : 'pendiente'; state.splitCollectMode[t.id]=false; }
          toast('Se quitó el reembolso pendiente');
        } else {
          t.estado='por_cobrar'; state.splitCollectMode[t.id]=true;
          t.porCobrar.push({persona:'', monto:null, pagado:false, tipo:'reembolso', montoRecibido:null, linkedTxId:null});
          toast('Marcado como reembolso pendiente');
        }
      }
      else if(act==='noesgasto'){
        if(t.estado==='no_es_gasto'){
          t.estado = t.categorias.length>0 ? 'confirmado' : 'pendiente';
          toast('Ya no está marcado como "no es gasto"');
        } else {
          // Una categoría ya asignada no corresponde a nada una vez que la transacción deja
          // de contar como gasto real (mismo criterio que ya usa classifySharedExpenseFromOthers()
          // en menu.ts al marcar este mismo estado) -- si no se limpia, queda una categoría
          // "fantasma" que ya no debería sumar en ningún lado.
          t.categorias = [];
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
    state.splitCategoryMode[id]=true;
    renderSheet();
    return;
  }
  const catUnitBtn = e.target.closest('[data-catunit]');
  if(catUnitBtn){
    state.splitCategoryUnit[state.openTxId] = catUnitBtn.getAttribute('data-catunit');
    renderSheet();
    return;
  }
  const addCatRow = e.target.closest('[data-add-cat-row]');
  if(addCatRow){
    const t = getTx(addCatRow.getAttribute('data-add-cat-row'));
    if(t){
      const usedCats = t.categorias.map(c=>c.cat);
      const pool = Object.keys(CATEGORIES).filter(k=>CATEGORIES[k].tipo===t.tipo && !usedCats.includes(k));
      const nextCat = pool[0] || Object.keys(CATEGORIES).find(k=>CATEGORIES[k].tipo===t.tipo);
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

  const toggleCobroSplit = e.target.closest('[data-toggle-chargesplit]');
  if(toggleCobroSplit){
    state.splitCollectMode[toggleCobroSplit.getAttribute('data-toggle-chargesplit')] = true;
    renderSheet();
    return;
  }
  const chargeUnitBtn = e.target.closest('[data-chargeunit]');
  if(chargeUnitBtn){
    state.splitCollectUnit[state.openTxId] = chargeUnitBtn.getAttribute('data-chargeunit');
    renderSheet();
    return;
  }
  // "Dividir este gasto con alguien" / "Editar reparto" — opens the shared split draft (see
  // renderSplitDraftForm in views/grupos.ts): fresh (defaultPersonaSplitDraft) if there's no
  // persona split yet, or rebuilt from what's already committed (draftFromExistingSplit) so
  // reopening it doesn't lose the modality/amounts chosen last time. Replaces the old
  // freeform "add a blank row and type a name/amount" flow (data-add-charge-row/data-add-contact) —
  // now that the sum has to match the total exactly for all 3 modalities, typing into
  // uncoordinated per-row fields could never guarantee that.
  const chargeSplitOpenBtn = e.target.closest('[data-charge-split-open]');
  if(chargeSplitOpenBtn){
    const t = getTx(chargeSplitOpenBtn.getAttribute('data-charge-split-open'));
    if(t){
      state.shareDraft = hasReceivableType(t,'persona') ? draftFromExistingSplit(t) : defaultPersonaSplitDraft(t.id);
      state.splitCollectMode[t.id] = true;
      renderSheet();
    }
    return;
  }
  const addReimbursementRow = e.target.closest('[data-add-reimbursement-row]');
  if(addReimbursementRow){
    const t = getTx(addReimbursementRow.getAttribute('data-add-reimbursement-row'));
    if(t){
      t.porCobrar.push({persona:'', monto:null, pagado:false, tipo:'reembolso', montoRecibido:null, linkedTxId:null});
      if(t.estado!=='por_cobrar'){ t.estado='por_cobrar'; }
      state.splitCollectMode[t.id]=true;
      renderSheet(); renderIfListVisible();
    }
    return;
  }
  const linkPendingBtn = e.target.closest('[data-link-pending]');
  if(linkPendingBtn){
    const idx = parseInt(linkPendingBtn.getAttribute('data-link-pending'),10);
    openLinkFromPending(state.openTxId, idx);
    return;
  }
  const writeOffBtn = e.target.closest('[data-write-off]');
  if(writeOffBtn){
    const idx = parseInt(writeOffBtn.getAttribute('data-write-off'),10);
    if(writeOffReceivable(state.openTxId, idx)){
      toast('Registrada como gasto de este mes');
      renderSheet(); renderIfListVisible();
    }
    return;
  }
  const openLinkIncomeBtn = e.target.closest('[data-open-link-income]');
  if(openLinkIncomeBtn){
    openLinkFromIncome(openLinkIncomeBtn.getAttribute('data-open-link-income'));
    return;
  }
  const unlinkPendingBtn = e.target.closest('[data-unlink-income]');
  if(unlinkPendingBtn){
    const ingresoId = unlinkPendingBtn.getAttribute('data-unlink-income');
    const found = pendingLinkedTo(ingresoId);
    if(found){
      const gastoTx = getTx(found.expenseTxId);
      const p = gastoTx.porCobrar[found.idx];
      p.pagado = false; p.montoRecibido = null; p.linkedTxId = null;
      toast('Vínculo eliminado');
      renderSheet(); renderIfListVisible();
    }
    return;
  }
  const pickIncomeBtn = e.target.closest('[data-pick-income]');
  if(pickIncomeBtn && state.linkFlow && state.linkFlow.mode==='fromPendiente'){
    const ingresoId = pickIncomeBtn.getAttribute('data-pick-income');
    const {expenseTxId, idx} = state.linkFlow;
    if(resolvePending(expenseTxId, idx, ingresoId)){
      state.linkFlow = null;
      toast('Depósito vinculado');
      openSheet(expenseTxId);
      renderIfListVisible();
    }
    return;
  }
  const pickPendingBtn = e.target.closest('[data-pick-pending]');
  if(pickPendingBtn && state.linkFlow && state.linkFlow.mode==='fromIngreso'){
    const [expenseTxId, idxStr] = pickPendingBtn.getAttribute('data-pick-pending').split('|');
    const idx = parseInt(idxStr,10);
    const incomeTxId = state.linkFlow.incomeTxId;
    if(resolvePending(expenseTxId, idx, incomeTxId)){
      state.linkFlow = null;
      toast('Pendiente vinculado');
      openSheet(incomeTxId);
      renderIfListVisible();
    }
    return;
  }
  const rmChargeRow = e.target.closest('[data-charge-remove]');
  if(rmChargeRow){
    const t = getTx(state.openTxId);
    const idx = parseInt(rmChargeRow.getAttribute('data-charge-remove'),10);
    if(t && t.porCobrar[idx]){
      t.porCobrar.splice(idx,1);
      // pagador/divisionTipo only mean anything while there's still a persona split -- clear
      // them so a brand new "Dividir este gasto" starts fresh instead of inheriting a stale payer.
      if(!t.porCobrar.some(p=>p.tipo==='persona')){ delete t.pagador; delete t.divisionTipo; }
      if(t.porCobrar.length===0){ t.estado = t.categorias.length>0 ? 'confirmado' : 'pendiente'; state.splitCollectMode[t.id]=false; }
      renderSheet(); renderIfListVisible();
    }
    return;
  }

  /* ---------- Split receipt with friends (simulated) ---------- */
  const openReceiptBtn = e.target.closest('[data-open-receipt]');
  if(openReceiptBtn){ openReceiptFlow(openReceiptBtn.getAttribute('data-open-receipt')); return; }
  const receiptCaptureBtn = e.target.closest('[data-receipt-capture]');
  if(receiptCaptureBtn && state.boleta){
    state.boleta.step = 'procesando';
    renderSheet();
    setTimeout(function(){
      if(!state.boleta || state.boleta.step!=='procesando') return; // the sheet may have closed while "processing"
      // we already know the merchant name (it's the real transaction's) — from the "photo" we only take the items
      const ejemplo = RECEIPT_EXAMPLES[Math.floor(Math.random()*RECEIPT_EXAMPLES.length)];
      state.boleta.items = ejemplo.items.map(function(it){ return {id: nextReceiptItemId(), nombre: it.nombre, monto: it.monto}; });
      state.boleta.step = 'items';
      renderSheet();
    }, 900);
    return;
  }
  const receiptItemRemoveBtn = e.target.closest('[data-receipt-item-remove]');
  if(receiptItemRemoveBtn && state.boleta){
    const idx = parseInt(receiptItemRemoveBtn.getAttribute('data-receipt-item-remove'),10);
    state.boleta.items.splice(idx,1);
    renderSheet();
    return;
  }
  const receiptAddItemBtn = e.target.closest('[data-receipt-add-item]');
  if(receiptAddItemBtn && state.boleta){
    state.boleta.items.push({id: nextReceiptItemId(), nombre:'', monto:0});
    renderSheet();
    return;
  }
  const receiptGotoBtn = e.target.closest('[data-receipt-goto]');
  if(receiptGotoBtn && state.boleta){
    state.boleta.step = receiptGotoBtn.getAttribute('data-receipt-goto');
    renderSheet();
    return;
  }
  const receiptTogglePersonBtn = e.target.closest('[data-receipt-toggle-person]');
  if(receiptTogglePersonBtn && state.boleta){
    const [itemIdStr, persona] = receiptTogglePersonBtn.getAttribute('data-receipt-toggle-person').split('|');
    const itemId = parseInt(itemIdStr,10);
    const asign = state.boleta.asign;
    const list = asign[itemId] || (asign[itemId] = []);
    const pos = list.indexOf(persona);
    if(pos===-1) list.push(persona); else list.splice(pos,1);
    renderSheet();
    return;
  }
  const receiptSaveBtn = e.target.closest('[data-receipt-save]');
  if(receiptSaveBtn && state.boleta){ saveReceipt(); return; }
  const receiptTipUnitBtn = e.target.closest('[data-receipt-tip-unit]');
  if(receiptTipUnitBtn && state.boleta){
    state.boleta.propinaUnit = receiptTipUnitBtn.getAttribute('data-receipt-tip-unit');
    state.boleta.propinaValor = ''; // switching from % to $ (or vice versa) starts at zero to avoid confusing units
    renderSheet();
    return;
  }
  const receiptTipQuickBtn = e.target.closest('[data-receipt-tip-quick]');
  if(receiptTipQuickBtn && state.boleta){
    state.boleta.propinaUnit = '%';
    state.boleta.propinaValor = receiptTipQuickBtn.getAttribute('data-receipt-tip-quick');
    renderSheet();
    return;
  }

  /* ---------- Menu (Phase 4) ---------- */
  const menuOpenBtn = e.target.closest('[data-menu-open]');
  if(menuOpenBtn){
    state.menuSection = menuOpenBtn.getAttribute('data-menu-open');
    if(state.menuSection==='importarcorreo' && !state.emailImportLoaded){
      state.emailImportLoading = true;
      renderMenuView();
      loadEmailImportScreen();
      return;
    }
    if(state.menuSection==='reconciliar' && !state.reconciliar.movimientos.length){
      loadAvailableStatements();
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
    if(state.notifSubscribed) disableNotifications(); else enableNotifications();
    return;
  }
  const notifTestBtn = e.target.closest('[data-notif-test]');
  if(notifTestBtn){
    sendTestPush();
    return;
  }
  const menuBackBtn = e.target.closest('[data-menu-back]');
  if(menuBackBtn){
    state.menuSection = null;
    state.editingCategoryId = null;
    state.editingPaymentMethodId = null;
    renderMenuView();
    return;
  }

  /* ---- Groups (shared expenses) ---- */
  const groupBackBtn = e.target.closest('[data-group-back]');
  if(groupBackBtn){
    state.openGroupId = null; state.addingParticipant = false;
    renderGroupsView();
    return;
  }
  const groupOpenBtn = e.target.closest('[data-group-open]');
  if(groupOpenBtn){
    state.openGroupId = groupOpenBtn.getAttribute('data-group-open');
    renderGroupsView();
    return;
  }
  const groupCreateOpenBtn = e.target.closest('[data-group-create-open]');
  if(groupCreateOpenBtn){
    state.creatingGroup = true; state.groupDraft = {nombre:'', icono:'👥'};
    renderGroupsView();
    return;
  }
  const groupCreateCancelBtn = e.target.closest('[data-group-create-cancel]');
  if(groupCreateCancelBtn){
    state.creatingGroup = false;
    renderGroupsView();
    return;
  }
  const groupDraftIconBtn = e.target.closest('[data-group-draft-icon]');
  if(groupDraftIconBtn){
    state.groupDraft.icono = groupDraftIconBtn.getAttribute('data-group-draft-icon');
    renderGroupsView();
    return;
  }
  const groupCreateConfirmBtn = e.target.closest('[data-group-create-confirm]');
  if(groupCreateConfirmBtn){
    const d = state.groupDraft;
    if(d.nombre.trim()){
      createGroup(d.nombre.trim(), d.icono).then(function(res){
        state.creatingGroup = false;
        toast(res.data ? 'Grupo "'+res.data.nombre+'" creado' : 'No se pudo crear el grupo — ' + (res.error ? res.error.message : 'revisa tu conexión'));
        renderGroupsView();
      });
    }
    return;
  }
  const groupJoinOpenBtn = e.target.closest('[data-group-join-open]');
  if(groupJoinOpenBtn){
    state.joiningGroup = true; state.joinDraft = {inviteCode:'', nombre:''};
    renderGroupsView();
    return;
  }
  const groupJoinCancelBtn = e.target.closest('[data-group-join-cancel]');
  if(groupJoinCancelBtn){
    state.joiningGroup = false;
    renderGroupsView();
    return;
  }
  const groupJoinConfirmBtn = e.target.closest('[data-group-join-confirm]');
  if(groupJoinConfirmBtn){
    const d = state.joinDraft;
    if(d.inviteCode.trim() && d.nombre.trim()){
      joinGroup(d.inviteCode.trim(), d.nombre.trim()).then(function(ok){
        state.joiningGroup = false;
        toast(ok ? 'Te uniste al grupo' : 'No se pudo unir — revisa el código');
        renderGroupsView();
      });
    }
    return;
  }
  const groupAddParticipantOpenBtn = e.target.closest('[data-group-add-participant-open]');
  if(groupAddParticipantOpenBtn){
    state.addingParticipant = true; state.participantDraft = {nombre:''};
    renderGroupsView();
    return;
  }
  const groupAddParticipantCancelBtn = e.target.closest('[data-group-add-participant-cancel]');
  if(groupAddParticipantCancelBtn){
    state.addingParticipant = false;
    renderGroupsView();
    return;
  }
  const groupAddParticipantConfirmBtn = e.target.closest('[data-group-add-participant-confirm]');
  if(groupAddParticipantConfirmBtn){
    const gid = groupAddParticipantConfirmBtn.getAttribute('data-group-add-participant-confirm');
    const nombre = state.participantDraft.nombre.trim();
    if(nombre){
      addParticipantWithoutAccount(gid, nombre, 'peach').then(function(p){
        state.addingParticipant = false;
        toast(p ? p.nombre+' se agregó al grupo' : 'No se pudo agregar — revisa tu conexión');
        renderGroupsView();
      });
    }
    return;
  }
  // Sub-tabs of a group's detail (Gastos/Balances/Transferencias) -- same simple pattern as
  // data-summary-sub (no drag here, only 3 fixed tabs).
  const groupTabBtn = e.target.closest('[data-group-tab]');
  if(groupTabBtn){
    state.groupDetailTab = groupTabBtn.getAttribute('data-group-tab');
    state.openGroupExpenseId = null; // switching tabs closes any expanded expense detail
    renderGroupsView();
    return;
  }
  // Tab "Gastos": tapping a row expands its inline detail card (.sheet-block.card) right below
  // the feed -- tapping the same row again (or the card's own "Cerrar") collapses it.
  const groupExpenseOpenBtn = e.target.closest('[data-group-expense-open]');
  if(groupExpenseOpenBtn){
    const id = groupExpenseOpenBtn.getAttribute('data-group-expense-open');
    state.openGroupExpenseId = state.openGroupExpenseId===id ? null : id;
    renderGroupsView();
    return;
  }
  const groupExpenseCloseBtn = e.target.closest('[data-group-expense-close]');
  if(groupExpenseCloseBtn){ state.openGroupExpenseId = null; renderGroupsView(); return; }
  // Tab "Balances" -> "Marcar como pagado" on a suggested transfer: registers exactly that
  // transfer (any two participants, not just "me") through the same registerPaidBalance() used
  // by the manual-transfer form below -- one single call path for both.
  const markTransferBtn = e.target.closest('[data-mark-transfer-paid]');
  if(markTransferBtn){
    const [gid, fromId, toId, montoStr] = markTransferBtn.getAttribute('data-mark-transfer-paid').split('|');
    registerPaidBalance(gid, fromId, toId, parseInt(montoStr,10)).then(function(ok){
      toast(ok ? 'Transferencia registrada' : 'No se pudo registrar la transferencia — revisa tu conexión');
      renderGroupsView();
    });
    return;
  }
  // Tab "Transferencias": manual entry (someone paid outside the app) -- same registerPaidBalance().
  const manualTransferOpenBtn = e.target.closest('[data-manual-transfer-open]');
  if(manualTransferOpenBtn){
    const gid = manualTransferOpenBtn.getAttribute('data-manual-transfer-open');
    const participantes = participantsOfGroup(gid);
    state.showManualTransferForm = true;
    state.manualTransferDraft = {
      deId: participantes[0] ? participantes[0].id : null,
      aId: participantes[1] ? participantes[1].id : (participantes[0] ? participantes[0].id : null),
      monto: 0, fecha: todayISO()
    };
    renderGroupsView();
    return;
  }
  const manualTransferCancelBtn = e.target.closest('[data-manual-transfer-cancel]');
  if(manualTransferCancelBtn){ state.showManualTransferForm = false; renderGroupsView(); return; }
  const manualTransferConfirmBtn = e.target.closest('[data-manual-transfer-confirm]');
  if(manualTransferConfirmBtn){
    const gid = manualTransferConfirmBtn.getAttribute('data-manual-transfer-confirm');
    const d = state.manualTransferDraft;
    if(d && d.deId && d.aId && d.deId!==d.aId && d.monto>0){
      registerPaidBalance(gid, d.deId, d.aId, d.monto).then(function(ok){
        state.showManualTransferForm = false;
        toast(ok ? 'Transferencia registrada' : 'No se pudo registrar la transferencia — revisa tu conexión');
        renderGroupsView();
      });
    }
    return;
  }
  const groupCreateExpenseOpenBtn = e.target.closest('[data-group-create-expense-open]');
  if(groupCreateExpenseOpenBtn){
    // Opens the same "new transaction" sheet as the + on Transacciones -- on save,
    // saveDraftTx() sees this flag and instead of closing the sheet leaves the newly created
    // transaction open on its detail, ready to complete the split (see the data-save-draft handler).
    state.createExpenseFromGroupId = groupCreateExpenseOpenBtn.getAttribute('data-group-create-expense-open');
    openNewTxSheet('gasto');
    return;
  }
  const askDeleteGroupBtn = e.target.closest('[data-ask-delete-group]');
  if(askDeleteGroupBtn){ state.confirmDeleteGroupId = askDeleteGroupBtn.getAttribute('data-ask-delete-group'); renderGroupsView(); return; }
  const cancelDeleteGroupBtn = e.target.closest('[data-cancel-delete-group]');
  if(cancelDeleteGroupBtn){ state.confirmDeleteGroupId = null; renderGroupsView(); return; }
  const confirmDeleteGroupBtn = e.target.closest('[data-confirm-delete-group]');
  if(confirmDeleteGroupBtn){
    const gid = confirmDeleteGroupBtn.getAttribute('data-confirm-delete-group');
    deleteGroup(gid).then(function(ok){
      state.confirmDeleteGroupId = null;
      if(ok){ state.openGroupId = null; toast('Grupo eliminado'); }
      else toast('No se pudo eliminar el grupo — revisa tu conexión');
      renderGroupsView();
    });
    return;
  }
  const shareOpenBtn = e.target.closest('[data-share-open]');
  if(shareOpenBtn){
    const txId = shareOpenBtn.getAttribute('data-share-open');
    state.shareDraft = defaultShareDraft(txId);
    renderSheet();
    return;
  }
  const shareCancelBtn = e.target.closest('[data-share-cancel]');
  if(shareCancelBtn){
    state.shareDraft = null;
    renderSheet();
    return;
  }
  const shareConfirmBtn = e.target.closest('[data-share-confirm]');
  if(shareConfirmBtn){
    const txId = shareConfirmBtn.getAttribute('data-share-confirm');
    const d = state.shareDraft;
    const t = getTx(txId);
    if(d && t && d.txId===txId && d.pagadoPorId && d.participantesIncluidos.length>0){
      const reparto = computeShareAmounts(t.monto, d);
      const suma = shareAmountsSum(reparto, d.participantesIncluidos);
      if(suma!==t.monto) return; // hard guard -- the confirm button should already be disabled
      if(d.groupId){
        shareExistingTransaction(txId, d.groupId, d.pagadoPorId, d.divisionTipo, reparto).then(function(gasto){
          state.shareDraft = null;
          toast(gasto ? 'Gasto compartido' : 'No se pudo compartir — revisa tu conexión');
          render();
        });
      } else {
        commitPersonaSplit(t, d, reparto);
        state.shareDraft = null;
        toast('Reparto guardado');
        renderSheet(); renderIfListVisible();
      }
    }
    return;
  }

  const addCatBtn = e.target.closest('[data-add-cat]');
  if(addCatBtn){
    state.editingCategoryId = 'nueva';
    state.catDraft = {nombre:'', tipo:'gasto', color:'sage', icon:'🏷️'};
    renderMenuView();
    return;
  }
  const editCatBtn = e.target.closest('[data-edit-cat]');
  if(editCatBtn){
    const id = editCatBtn.getAttribute('data-edit-cat');
    const c = CATEGORIES[id];
    state.editingCategoryId = id;
    state.catDraft = {nombre:c.nombre, tipo:c.tipo, color:c.color, icon:c.icon};
    renderMenuView();
    return;
  }
  const cancelCatEditBtn = e.target.closest('[data-cancel-cat-edit]');
  if(cancelCatEditBtn){ state.editingCategoryId = null; renderMenuView(); return; }
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
      CATEGORIES['cat_'+Date.now()] = {nombre:d.nombre.trim(), tipo:d.tipo, color:d.color, icon:d.icon};
      toast('Categoría creada');
    } else {
      CATEGORIES[idAttr].nombre = d.nombre.trim();
      CATEGORIES[idAttr].color = d.color;
      CATEGORIES[idAttr].icon = d.icon;
      toast('Categoría actualizada');
    }
    state.editingCategoryId = null;
    renderMenuView();
    return;
  }
  const deleteCatBtn = e.target.closest('[data-delete-cat]');
  if(deleteCatBtn){
    const id = deleteCatBtn.getAttribute('data-delete-cat');
    if(isCategoryInUse(id)){ toast('No puedes eliminar una categoría con transacciones'); return; }
    delete CATEGORIES[id];
    delete BUDGETS[id];
    state.editingCategoryId = null;
    toast('Categoría eliminada');
    renderMenuView();
    return;
  }

  const addPaymentMethodBtn = e.target.closest('[data-add-payment-method]');
  if(addPaymentMethodBtn){
    state.editingPaymentMethodId = 'nueva';
    state.medioDraft = {nombre:'', corto:'', icon:'card'};
    renderMenuView();
    return;
  }
  const editPaymentMethodBtn = e.target.closest('[data-edit-payment-method]');
  if(editPaymentMethodBtn){
    const id = editPaymentMethodBtn.getAttribute('data-edit-payment-method');
    const m = PAYMENT_METHODS[id];
    state.editingPaymentMethodId = id;
    state.medioDraft = {nombre:m.nombre, corto:m.corto, icon:m.icon};
    renderMenuView();
    return;
  }
  const cancelPaymentMethodEditBtn = e.target.closest('[data-cancel-payment-method-edit]');
  if(cancelPaymentMethodEditBtn){ state.editingPaymentMethodId = null; renderMenuView(); return; }
  const paymentMethodDraftIconBtn = e.target.closest('[data-payment-method-draft-icon]');
  if(paymentMethodDraftIconBtn){ state.medioDraft.icon = paymentMethodDraftIconBtn.getAttribute('data-payment-method-draft-icon'); renderMenuView(); return; }
  const savePaymentMethodBtn = e.target.closest('[data-save-payment-method]');
  if(savePaymentMethodBtn){
    const idAttr = savePaymentMethodBtn.getAttribute('data-save-payment-method');
    const d = state.medioDraft;
    if(!d.nombre.trim()){ toast('Ponle un nombre al medio de pago'); return; }
    if(idAttr==='nueva'){
      PAYMENT_METHODS['medio_'+Date.now()] = {nombre:d.nombre.trim(), corto:d.corto.trim(), icon:d.icon};
      toast('Medio de pago creado');
    } else {
      PAYMENT_METHODS[idAttr].nombre = d.nombre.trim();
      PAYMENT_METHODS[idAttr].corto = d.corto.trim();
      PAYMENT_METHODS[idAttr].icon = d.icon;
      toast('Medio de pago actualizado');
    }
    state.editingPaymentMethodId = null;
    renderMenuView();
    return;
  }
  const deletePaymentMethodBtn = e.target.closest('[data-delete-payment-method]');
  if(deletePaymentMethodBtn){
    const id = deletePaymentMethodBtn.getAttribute('data-delete-payment-method');
    if(isPaymentMethodInUse(id)){ toast('No puedes eliminar un medio de pago con transacciones'); return; }
    delete PAYMENT_METHODS[id];
    state.editingPaymentMethodId = null;
    toast('Medio de pago eliminado');
    renderMenuView();
    return;
  }

  const deleteRuleBtn = e.target.closest('[data-delete-rule]');
  if(deleteRuleBtn){
    const comercio = decodeURIComponent(deleteRuleBtn.getAttribute('data-delete-rule'));
    TRANSACTIONS.forEach(t=>{ if(t.comercio===comercio) t.reglaAuto = false; });
    toast('Regla eliminada para '+comercio);
    renderMenuView();
    return;
  }

  const exportCsvBtn = e.target.closest('[data-export-csv]');
  if(exportCsvBtn){
    downloadFile('pitucas-sin-lucas-transacciones-'+todayISO()+'.csv', buildTransactionsCSV(), 'text/csv;charset=utf-8;');
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

  const reconciliarReset = e.target.closest('[data-reconcile-reset]');
  if(reconciliarReset){
    state.reconciliar = {archivo:null, cargando:false, error:null, tipo:null, movimientos:[], pagosTarjeta:null,
      disponibles: state.reconciliar.disponibles, usandoId:null, passwordDraft:'', errorPassword:null,
      archivoBuffer:null, archivoNombrePendiente:null, eliminarSeleccionados:[]};
    renderMenuView();
    return;
  }
  const reconciliarArchivoAbrir = e.target.closest('[data-reconcile-file-open]');
  if(reconciliarArchivoAbrir){
    tryOpenStatementFile(state.reconciliar.archivoBuffer, state.reconciliar.archivoNombrePendiente, state.reconciliar.passwordDraft);
    return;
  }
  const reconciliarArchivoCancelar = e.target.closest('[data-reconcile-file-cancel]');
  if(reconciliarArchivoCancelar){
    state.reconciliar.archivoBuffer = null;
    state.reconciliar.archivoNombrePendiente = null;
    state.reconciliar.errorPassword = null;
    state.reconciliar.passwordDraft = '';
    renderMenuView();
    return;
  }
  const cartolaUsar = e.target.closest('[data-statement-use]');
  if(cartolaUsar){
    state.reconciliar.usandoId = cartolaUsar.getAttribute('data-statement-use');
    state.reconciliar.passwordDraft = '';
    state.reconciliar.errorPassword = null;
    renderMenuView();
    return;
  }
  const cartolaCancelar = e.target.closest('[data-statement-cancel]');
  if(cartolaCancelar){
    state.reconciliar.usandoId = null;
    state.reconciliar.errorPassword = null;
    renderMenuView();
    return;
  }
  const cartolaAbrir = e.target.closest('[data-statement-open]');
  if(cartolaAbrir){
    useImportedStatement(cartolaAbrir.getAttribute('data-statement-open'), state.reconciliar.passwordDraft);
    return;
  }
  const reconciliarAgregar = e.target.closest('[data-reconcile-add]');
  if(reconciliarAgregar){
    const idx = parseInt(reconciliarAgregar.getAttribute('data-reconcile-add'),10);
    const normales = state.reconciliar.movimientos.filter(function(m){ return m.esEspecial!=='pago_tarjeta' && m.esEspecial!=='pago_recibido'; });
    const m = normales[idx];
    if(m && !m.__match){
      createTxFromMovement(m);
      m.__match = findSimilarTx(m); // now it does match (with the one just created)
      renderMenuView();
      renderIfListVisible();
      toast('Transacción agregada');
    }
    return;
  }
  const reconciliarNoEsGasto = e.target.closest('[data-reconcile-not-expense]');
  if(reconciliarNoEsGasto){
    const idx = parseInt(reconciliarNoEsGasto.getAttribute('data-reconcile-not-expense'),10);
    const normales = state.reconciliar.movimientos.filter(function(m){ return m.esEspecial!=='pago_tarjeta' && m.esEspecial!=='pago_recibido'; });
    const m = normales[idx];
    if(m && !m.__match){
      createTxFromMovement(m, {noEsGasto:true});
      m.__match = findSimilarTx(m);
      renderMenuView();
      renderIfListVisible();
      toast('Agregada como "no es gasto"');
    }
    return;
  }
  const reconciliarAgregarTodo = e.target.closest('[data-reconcile-add-all]');
  if(reconciliarAgregarTodo){
    const normales = state.reconciliar.movimientos.filter(function(m){ return m.esEspecial!=='pago_tarjeta' && m.esEspecial!=='pago_recibido'; });
    let n = 0;
    normales.forEach(function(m){
      if(!m.__match){ createTxFromMovement(m); m.__match = findSimilarTx(m); n++; }
    });
    renderMenuView();
    renderIfListVisible();
    toast(n===1 ? 'Se agregó 1 transacción' : 'Se agregaron '+n+' transacciones');
    return;
  }

  // ---- Automatic reconciliation diff (see reconcile.ts) ----
  const reconciliarDiffAddAltas = e.target.closest('[data-reconcile-diff-add-altas]');
  if(reconciliarDiffAddAltas){
    // Only "alta" confidence items ever get a one-click bulk action -- "media"/"baja" always
    // land in "revisar" instead (see buildReconcileDiff), never auto-actionable in bulk.
    const diff = buildReconcileDiff(state.reconciliar.movimientos, state.reconciliar.tipo);
    const altas = diff.agregar.filter(function(item){ return item.confianza==='alta'; });
    altas.forEach(function(item){
      createTxFromMovement(item.movimiento);
      item.movimiento.__match = findSimilarTx(item.movimiento); // keeps the movement list above in sync too
    });
    renderMenuView();
    renderIfListVisible();
    toast(altas.length===1 ? 'Se agregó 1 transacción' : 'Se agregaron '+altas.length+' transacciones');
    return;
  }
  const reconciliarDiffElimConfirmar = e.target.closest('[data-reconcile-diff-elim-confirmar]');
  if(reconciliarDiffElimConfirmar){
    // Never trust the checkboxes alone: recompute the diff and only ever delete ids that are
    // BOTH checked AND still a genuine eliminarPropuesto candidate right now (origen
    // 'auto-mail'/'auto-cartola' only -- isProtectedOrigin transactions can never reach
    // eliminarPropuesto in the first place, but this stays defense-in-depth against acting on a
    // stale selection after the statement/transactions changed underneath it).
    const diff = buildReconcileDiff(state.reconciliar.movimientos, state.reconciliar.tipo);
    const idsPropuestos = diff.eliminarPropuesto.map(function(item){ return item.tx.id; });
    const aEliminar = state.reconciliar.eliminarSeleccionados.filter(function(id){ return idsPropuestos.indexOf(id)!==-1; });
    if(aEliminar.length){
      setTransactions(TRANSACTIONS.filter(function(t){ return aEliminar.indexOf(t.id)===-1; }));
      state.reconciliar.eliminarSeleccionados = [];
      renderMenuView();
      renderIfListVisible();
      toast(aEliminar.length===1 ? 'Se eliminó 1 transacción' : 'Se eliminaron '+aEliminar.length+' transacciones');
    }
    return;
  }
  const gotoPendingBtn = e.target.closest('[data-goto-pending]');
  if(gotoPendingBtn){
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
        // "Sin categoría": if it's the only row, the transaction is left unclassified (the
        // empty row shows again); if there are more rows, this one is removed and its amount
        // is added to the first one remaining — same rule as the row-delete button.
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
      state.addingPaymentMethod = true;
      state.newPaymentMethodDraft = {nombre:'', ultimos4:''};
      renderSheet();
      setTimeout(()=>{ const el=document.querySelector<HTMLElement>('[data-new-payment-method-field="nombre"]'); if(el) el.focus(); }, 50);
      return;
    }
    state.draftTx.medio = draftMedio.value;
    return;
  }
  const txPaymentMethodSelect = e.target.closest('[data-tx-payment-method-select]');
  if(txPaymentMethodSelect){
    const t = getTx(txPaymentMethodSelect.getAttribute('data-tx-payment-method-select'));
    if(t){ t.medio = txPaymentMethodSelect.value; renderIfListVisible(); }
    return;
  }
  const shareGroupSelect = e.target.closest('[data-share-group]');
  if(shareGroupSelect && state.shareDraft){
    state.shareDraft = defaultShareDraft(state.shareDraft.txId, shareGroupSelect.value);
    renderSheet();
    return;
  }
  const compartirIncluirBox = e.target.closest('[data-share-include]');
  if(compartirIncluirBox && state.shareDraft){
    const pid = compartirIncluirBox.getAttribute('data-share-include');
    const d = state.shareDraft;
    const idx = d.participantesIncluidos.indexOf(pid);
    if(compartirIncluirBox.checked && idx===-1) d.participantesIncluidos.push(pid);
    else if(!compartirIncluirBox.checked && idx!==-1) d.participantesIncluidos.splice(idx,1);
    renderSheet();
    return;
  }
  // "+ agregar persona" inside the split draft (no-group only — see shareDraftParticipants):
  // adds a brand new ad-hoc name to the pool AND checks it in, ready for the live preview.
  const shareAddNameBtn = e.target.closest('[data-share-add-name]');
  if(shareAddNameBtn && state.shareDraft){
    const row = shareAddNameBtn.closest('.split-row');
    const input = row ? row.querySelector('[data-share-new-name]') as HTMLInputElement : null;
    const name = input ? input.value.trim() : '';
    if(name){
      const d = state.shareDraft;
      if(!d.extraParticipants.includes(name)) d.extraParticipants.push(name);
      if(!d.participantesIncluidos.includes(name)) d.participantesIncluidos.push(name);
      renderSheet();
    }
    return;
  }
  // Manual transfer form (group detail, tab "Transferencias") -- "de"/"a" selects and the date
  // input change live; the amount field (text, Tricount-style expressions) is handled in the
  // 'input' listener below, same split as the rest of the app's money fields.
  const manualTransferSelect = e.target.closest('[data-manual-transfer-field="deId"], [data-manual-transfer-field="aId"]');
  if(manualTransferSelect && state.manualTransferDraft){
    state.manualTransferDraft[manualTransferSelect.getAttribute('data-manual-transfer-field')] = manualTransferSelect.value;
    renderGroupsView();
    return;
  }
  const manualTransferDate = e.target.closest('[data-manual-transfer-field="fecha"]');
  if(manualTransferDate && state.manualTransferDraft){
    state.manualTransferDraft.fecha = manualTransferDate.value;
    return;
  }

  // Per-item confirmation for "Posibles a eliminar" in the automatic reconciliation diff
  // (see reconcile.ts) -- checking a box only stages it; nothing is deleted until "Eliminar
  // seleccionadas" is pressed too (see the click handler below), never a single click.
  const reconciliarElimCheck = e.target.closest('[data-reconcile-diff-elim-check]');
  if(reconciliarElimCheck){
    const txId = reconciliarElimCheck.getAttribute('data-reconcile-diff-elim-check');
    const sel = state.reconciliar.eliminarSeleccionados;
    const idx = sel.indexOf(txId);
    if(reconciliarElimCheck.checked && idx===-1) sel.push(txId);
    else if(!reconciliarElimCheck.checked && idx!==-1) sel.splice(idx,1);
    renderMenuView();
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
        const {rows, errors} = parseStatementCSV(String(ev.target.result||''));
        const result = importStatementRows(rows);
        state.importSummary = {archivo: file.name, errores: errors, creadas: result.creadas, conRegla: result.conRegla, pendientes: result.pendientes};
        renderMenuView();
        renderIfListVisible();
        toast(result.creadas+' transacciones importadas');
      };
      reader.readAsText(file, 'UTF-8');
    }
    return;
  }

  const reconcileFileInput = e.target.closest('[data-reconcile-file-input]');
  if(reconcileFileInput){
    const file = reconcileFileInput.files && reconcileFileInput.files[0];
    if(file){
      state.reconciliar.passwordDraft = '';
      const reader = new FileReader();
      reader.onload = function(ev){
        tryOpenStatementFile(ev.target.result, file.name, '');
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
      const unit = state.splitCategoryUnit[t.id] || '$';
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
  const cobroAmt = e.target.closest('[data-charge-amount]');
  if(cobroAmt){
    const t = getTx(state.openTxId);
    const idx = parseInt(cobroAmt.getAttribute('data-charge-amount'),10);
    if(t){
      const unit = state.splitCollectUnit[t.id] || '$';
      const v = safeEvalExpr(cobroAmt.value);
      if(v!==null){
        t.porCobrar[idx].monto = unit==='%' ? Math.round(t.monto * v/100) : Math.round(v);
        const remainingEl = cobroAmt.closest('.split-block').querySelector('.split-remaining span:last-child');
        if(remainingEl){
          const totalCobro = receivableTotal(t);
          const tuParte = t.monto - totalCobro;
          remainingEl.textContent = money(tuParte);
          remainingEl.className = (tuParte<0?'bad':'ok')+' tabular';
        }
      }
    }
    return;
  }
  // A %/monto value typed into the split draft (see renderSplitDraftForm) — patches just the
  // "total repartido"/error line and the confirm button's disabled state directly in the DOM
  // (same reasoning as data-cat-amount/data-charge-amount above: a full renderSheet() on every
  // keystroke would steal focus mid-typing).
  const shareValueInput = e.target.closest('[data-share-value]');
  if(shareValueInput && state.shareDraft){
    const id = shareValueInput.getAttribute('data-share-value');
    const d = state.shareDraft;
    d.customValues[id] = shareValueInput.value;
    const t = getTx(d.txId);
    if(t){
      const reparto = computeShareAmounts(t.monto, d);
      const suma = shareAmountsSum(reparto, d.participantesIncluidos);
      const ok = suma===t.monto && d.participantesIncluidos.length>0;
      const wrap = shareValueInput.closest('.sheet-block');
      if(wrap){
        const remainingEl = wrap.querySelector('.split-remaining span:last-child');
        if(remainingEl){ remainingEl.textContent = money(suma)+' de '+money(t.monto); remainingEl.className = (ok?'ok':'bad')+' tabular'; }
        const errEl = wrap.querySelector('.field-error') as HTMLElement;
        if(errEl){
          const remaining = t.monto - suma;
          errEl.textContent = ok ? '' : (remaining>0 ? 'Faltan '+money(remaining)+' por repartir' : 'Sobran '+money(-remaining)+' por repartir');
          errEl.style.display = ok ? 'none' : '';
        }
        const confirmBtn = wrap.querySelector('[data-share-confirm]') as HTMLButtonElement;
        if(confirmBtn) confirmBtn.disabled = !ok;
        // "Por partes": editing ANY one row's "número de partes" moves the shared denominator, so
        // every row's peso readout has to be repainted, not just the one being typed into.
        if(d.divisionTipo==='iguales'){
          wrap.querySelectorAll('[data-share-computed]').forEach(el=>{
            const pid = el.getAttribute('data-share-computed');
            el.textContent = money(reparto[pid]||0);
          });
        }
      }
    }
    return;
  }
  const cobroName = e.target.closest('[data-charge-name]');
  if(cobroName){
    const t = getTx(state.openTxId);
    const idx = parseInt(cobroName.getAttribute('data-charge-name'),10);
    if(t){ t.porCobrar[idx].persona = cobroName.value; }
    return;
  }
  const boletaItemNombre = e.target.closest('[data-receipt-item-name]');
  if(boletaItemNombre && state.boleta){
    const idx = parseInt(boletaItemNombre.getAttribute('data-receipt-item-name'),10);
    state.boleta.items[idx].nombre = boletaItemNombre.value;
    return;
  }
  const boletaItemMonto = e.target.closest('[data-receipt-item-amount]');
  if(boletaItemMonto && state.boleta){
    const idx = parseInt(boletaItemMonto.getAttribute('data-receipt-item-amount'),10);
    const v = safeEvalMoneyExpr(boletaItemMonto.value);
    if(v!==null){
      state.boleta.items[idx].monto = Math.round(v);
      liveFormatThousands(boletaItemMonto);
      const summaryEl = document.getElementById('boleta-totals-summary');
      if(summaryEl) summaryEl.innerHTML = renderReceiptItemsTotalsSummary();
      const continueBtn = document.querySelector<HTMLButtonElement>('[data-receipt-goto="asignar"]');
      if(continueBtn) continueBtn.disabled = !(state.boleta.items.length>0 && receiptTotal()>0);
    }
    return;
  }
  const receiptTipInput = e.target.closest('[data-receipt-tip-input]');
  if(receiptTipInput && state.boleta){
    state.boleta.propinaValor = receiptTipInput.value;
    const summaryEl = document.getElementById('boleta-totals-summary');
    if(summaryEl) summaryEl.innerHTML = renderReceiptItemsTotalsSummary();
    return;
  }
  // Editing Monto/Fecha/Hora of an already-existing transaction, from the detail view — the
  // data is updated right away and the formatted echo and header are refreshed by hand (without
  // a full renderSheet(), so as not to lose the field's focus while still typing/choosing).
  const txFieldMonto = e.target.closest('[data-tx-field="monto"]');
  if(txFieldMonto){
    const tx = getTx(txFieldMonto.getAttribute('data-tx'));
    if(tx){
      const newMonto = parseInt(txFieldMonto.value.replace(/\D/g,''),10) || 0;
      tx.monto = newMonto;
      // catTotalAmount() -- lo que usan Balance/Presupuesto/Evolución para sus agregados --
      // suma desde tx.categorias[].monto, no desde tx.monto: si no se mantienen sincronizadas
      // acá, el monto nuevo se ve bien en el detalle y en la lista, pero esas otras vistas
      // siguen calculando con el monto viejo. Con una sola categoría (el caso común) se le pone
      // el monto nuevo directo; con varias, se reescala cada una proporcionalmente preservando
      // el reparto (la última absorbe el resto del redondeo para que la suma calce exacto).
      if(tx.categorias.length===1){
        tx.categorias[0].monto = newMonto;
      } else if(tx.categorias.length>1){
        const oldTotal = tx.categorias.reduce((s,c)=>s+c.monto,0);
        if(oldTotal>0){
          let asignado = 0;
          tx.categorias.forEach((c,idx)=>{
            if(idx===tx.categorias.length-1){ c.monto = newMonto - asignado; }
            else { c.monto = Math.round(c.monto/oldTotal*newMonto); asignado += c.monto; }
          });
        }
      }
      liveFormatThousands(txFieldMonto);
      const echoEl = txFieldMonto.closest('.edit-amount-row').querySelector('.edit-amount-echo');
      const txt = (tx.tipo==='ingreso'?'+':'')+money(tx.monto);
      if(echoEl) echoEl.textContent = txt;
      const headEl = document.querySelector('.sheet-amount');
      if(headEl) headEl.textContent = txt;
    }
    return;
  }
  const txFieldComercio = e.target.closest('[data-tx-field="comercio"]');
  if(txFieldComercio){
    const tx = getTx(txFieldComercio.getAttribute('data-tx'));
    if(tx){
      tx.comercio = txFieldComercio.value;
      const titleEl = document.getElementById('sheet-title-el');
      if(titleEl) titleEl.textContent = tx.comercio;
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
      if(metaEl) metaEl.textContent = dayLabel(tx.fecha)+' · '+tx.hora+' · '+paymentMethodInfo(tx.medio).nombre;
    }
    return;
  }
  const txFieldHora = e.target.closest('[data-tx-field="hora"]');
  if(txFieldHora && txFieldHora.value){
    const tx = getTx(txFieldHora.getAttribute('data-tx'));
    if(tx){
      tx.hora = txFieldHora.value;
      const metaEl = document.querySelector('.sheet-top .meta');
      if(metaEl) metaEl.textContent = dayLabel(tx.fecha)+' · '+tx.hora+' · '+paymentMethodInfo(tx.medio).nombre;
    }
    return;
  }
  const txFieldNota = e.target.closest('[data-tx-field="nota"]');
  if(txFieldNota){
    const tx = getTx(txFieldNota.getAttribute('data-tx'));
    if(tx){
      tx.nota = txFieldNota.value;
      const notaEl = document.querySelector<HTMLElement>('.sheet-top [data-note-echo]');
      if(notaEl){ notaEl.textContent = tx.nota; notaEl.style.display = tx.nota ? '' : 'none'; }
    }
    return;
  }
  const newPaymentMethodField = e.target.closest('[data-new-payment-method-field]');
  if(newPaymentMethodField){
    const field = newPaymentMethodField.getAttribute('data-new-payment-method-field');
    if(field==='nombre') state.newPaymentMethodDraft.nombre = newPaymentMethodField.value;
    else if(field==='ultimos4') state.newPaymentMethodDraft.ultimos4 = newPaymentMethodField.value.replace(/\D/g,'').slice(0,4);
    const saveNewBtn = document.querySelector<HTMLButtonElement>('[data-save-new-payment-method]');
    if(saveNewBtn) saveNewBtn.disabled = !state.newPaymentMethodDraft.nombre.trim();
    return;
  }

  const budgetGoalInput = e.target.closest('[data-budget-goal-input]');
  if(budgetGoalInput){
    // stripThousandsMarks() first: liveFormatThousands() below leaves a "." in the field for
    // display, and storing that raw would make the safeEvalExpr() at save time misread it as a
    // decimal point (see stripThousandsMarks()'s own comment in shared-expenses.ts).
    state.budgetDraft.meta = stripThousandsMarks(budgetGoalInput.value);
    liveFormatThousands(budgetGoalInput);
    return;
  }
  const budgetTotalInput = e.target.closest('[data-budget-total-input]');
  if(budgetTotalInput){
    state.budgetTotalDraft = stripThousandsMarks(budgetTotalInput.value);
    liveFormatThousands(budgetTotalInput);
    return;
  }
  const spendingGoalsInput = e.target.closest('[data-spending-goals-input]');
  if(spendingGoalsInput){
    state.spendingGoalsDraft[spendingGoalsInput.getAttribute('data-spending-goals-input')] = spendingGoalsInput.value;
    return;
  }
  const transferInfoInput = e.target.closest('[data-transfer-info-input]');
  if(transferInfoInput){
    state.transferInfoDraft[transferInfoInput.getAttribute('data-transfer-info-input')] = transferInfoInput.value;
    return;
  }
  const statementPasswordInput = e.target.closest('[data-statement-password-input]');
  if(statementPasswordInput){
    state.reconciliar.passwordDraft = statementPasswordInput.value;
    return;
  }
  const goalField = e.target.closest('[data-goal-field]');
  if(goalField){
    const goalFieldName = goalField.getAttribute('data-goal-field');
    const esMonto = goalFieldName==='montoObjetivo' || goalFieldName==='aporteMensualMeta' || goalFieldName==='aportadoInicial';
    // Only the money fields go through stripThousandsMarks() -- the rest (comisión, tasa, etc.)
    // never get liveFormatThousands() applied to them, so their raw value never has a stray "."
    // to strip in the first place, and comisión in particular needs to keep real decimals.
    state.goalDraft[goalFieldName] = esMonto ? stripThousandsMarks(goalField.value) : goalField.value;
    if(esMonto) liveFormatThousands(goalField);
    return;
  }
  const platformField = e.target.closest('[data-platform-field]');
  if(platformField){
    const platformFieldName = platformField.getAttribute('data-platform-field');
    const esValor = platformFieldName==='valor';
    state.platformDraft[platformFieldName] = esValor ? stripThousandsMarks(platformField.value) : platformField.value;
    if(esValor) liveFormatThousands(platformField);
    return;
  }
  const newPlatformField = e.target.closest('[data-newplatform-field]');
  if(newPlatformField){
    const newPlatformFieldName = newPlatformField.getAttribute('data-newplatform-field');
    const esValor = newPlatformFieldName==='valor';
    state.newPlatformDraft[newPlatformFieldName] = esValor ? stripThousandsMarks(newPlatformField.value) : newPlatformField.value;
    if(esValor) liveFormatThousands(newPlatformField);
    return;
  }
  const catDraftField = e.target.closest('[data-cat-draft-field]');
  if(catDraftField){
    state.catDraft[catDraftField.getAttribute('data-cat-draft-field')] = catDraftField.value;
    return;
  }
  const paymentMethodDraftField = e.target.closest('[data-payment-method-draft-field]');
  if(paymentMethodDraftField){
    state.medioDraft[paymentMethodDraftField.getAttribute('data-payment-method-draft-field')] = paymentMethodDraftField.value;
    return;
  }
  const groupDraftField = e.target.closest('[data-group-draft-field]');
  if(groupDraftField){
    state.groupDraft[groupDraftField.getAttribute('data-group-draft-field')] = groupDraftField.value;
    return;
  }
  const joinDraftField = e.target.closest('[data-join-draft-field]');
  if(joinDraftField){
    state.joinDraft[joinDraftField.getAttribute('data-join-draft-field')] = joinDraftField.value;
    return;
  }
  const participantDraftField = e.target.closest('[data-participant-draft-field]');
  if(participantDraftField){
    state.participantDraft[participantDraftField.getAttribute('data-participant-draft-field')] = participantDraftField.value;
    return;
  }
  const manualTransferMonto = e.target.closest('[data-manual-transfer-field="monto"]');
  if(manualTransferMonto && state.manualTransferDraft){
    const v = safeEvalMoneyExpr(manualTransferMonto.value);
    if(v!==null) state.manualTransferDraft.monto = v;
    liveFormatThousands(manualTransferMonto);
    const confirmBtn = document.querySelector<HTMLButtonElement>('[data-manual-transfer-confirm]');
    if(confirmBtn){
      const d = state.manualTransferDraft;
      confirmBtn.disabled = !(d.deId && d.aId && d.deId!==d.aId && d.monto>0);
    }
    return;
  }

  const planBaseInput = e.target.closest('[data-plan-base-input]');
  if(planBaseInput){
    PLANNER.base = parseInt(planBaseInput.value.replace(/\D/g,''),10) || 0;
    liveFormatThousands(planBaseInput);
    updatePlanCompute();
    return;
  }
  const planGoalPctInput = e.target.closest('[data-plan-goal-pct]');
  if(planGoalPctInput){
    const metaId = planGoalPctInput.getAttribute('data-plan-goal-id');
    const v = parseFloat(planGoalPctInput.value.replace(',','.'));
    PLANNER.metaPcts[metaId] = isNaN(v) ? 0 : v;
    updatePlanCompute();
    return;
  }
  const projContributionInput = e.target.closest('[data-proj-contribution-input]');
  if(projContributionInput){
    const raw = projContributionInput.value.trim();
    // Empty = "go back to using your real average" (same rule as leaving the placeholder).
    state.simulatedContribution = raw==='' ? null : (parseInt(raw.replace(/\D/g,''),10) || 0);
    liveFormatThousands(projContributionInput);
    updateProyeccionCompute();
    return;
  }
  const projReturnInput = e.target.closest('[data-proj-return-input]');
  if(projReturnInput){
    const v = parseFloat(projReturnInput.value.replace(',','.'));
    PROJECTION_ASSUMPTIONS.retornoAnual = isNaN(v) ? 0 : v;
    updateProyeccionCompute();
    return;
  }

  const draftField = e.target.closest('[data-draft-field]');
  if(draftField && state.draftTx){
    const field = draftField.getAttribute('data-draft-field');
    if(field==='comercio'){ state.draftTx.comercio = draftField.value; }
    else if(field==='fecha'){ state.draftTx.fecha = draftField.value; }
    else if(field==='monto'){
      const v = safeEvalMoneyExpr(draftField.value);
      if(v!==null){
        state.draftTx.monto = v;
        if(state.draftTx.categorias[0]) state.draftTx.categorias[0].monto = v;
      }
      liveFormatThousands(draftField);
    }
    const saveBtn = document.querySelector<HTMLButtonElement>('[data-save-draft]');
    if(saveBtn) saveBtn.disabled = !(state.draftTx.comercio.trim().length>0 && state.draftTx.monto>0);
    return;
  }
});

// Normalizes fields with expressions (Tricount-style) when leaving the input,
// so the user sees the final number instead of the expression they typed.
phone.addEventListener('focusout', function(e: any){
  // Monto/Fecha/Nombre de una transacción ya existente se parchan a mano en vivo (ver el
  // listener de 'input' de arriba) para no perder el foco del campo mientras se sigue
  // escribiendo -- pero eso deja el resto de la app (la lista de Transacciones, Balance,
  // Presupuesto, Evolución) con datos viejos hasta el próximo render() completo, que antes no
  // pasaba hasta cambiar de vista a mano. Acá, recién cuando se sale del campo (ya no hay foco
  // que perder), se hace ese render() completo para que todo lo demás se ponga al día solo.
  const txFieldStale = e.target.closest('[data-tx-field="monto"], [data-tx-field="fecha"], [data-tx-field="comercio"]');
  if(txFieldStale){ render(); return; }
  const amtInput = e.target.closest('[data-cat-amount]');
  if(amtInput){
    const t = getTx(state.openTxId);
    const idx = parseInt(amtInput.getAttribute('data-cat-amount'),10);
    if(t && t.categorias[idx]){
      const unit = state.splitCategoryUnit[t.id] || '$';
      const shown = unit==='%' ? (t.categorias[idx].monto/t.monto)*100 : t.categorias[idx].monto;
      amtInput.value = formatEditableNumber(shown);
    }
    return;
  }
  const cobroAmt = e.target.closest('[data-charge-amount]');
  if(cobroAmt){
    const t = getTx(state.openTxId);
    const idx = parseInt(cobroAmt.getAttribute('data-charge-amount'),10);
    if(t && t.porCobrar[idx].monto!=null){
      const unit = state.splitCollectUnit[t.id] || '$';
      const shown = unit==='%' ? (t.porCobrar[idx].monto/t.monto)*100 : t.porCobrar[idx].monto;
      cobroAmt.value = formatEditableNumber(shown);
    }
    return;
  }
  const draftMonto = e.target.closest('[data-draft-field="monto"]');
  if(draftMonto && state.draftTx){ draftMonto.value = state.draftTx.monto ? formatEditableNumber(state.draftTx.monto) : ''; return; }

  const boletaItemMontoOut = e.target.closest('[data-receipt-item-amount]');
  if(boletaItemMontoOut && state.boleta){
    const idx = parseInt(boletaItemMontoOut.getAttribute('data-receipt-item-amount'),10);
    const item = state.boleta.items[idx];
    if(item) boletaItemMontoOut.value = formatEditableNumber(item.monto);
    return;
  }

  const planBaseInput = e.target.closest('[data-plan-base-input]');
  if(planBaseInput){ planBaseInput.value = moneyPlain(PLANNER.base); return; }

  const boletaPropinaInputOut = e.target.closest('[data-receipt-tip-input]');
  if(boletaPropinaInputOut && state.boleta && state.boleta.propinaValor!==''){
    const v = safeEvalExpr(String(state.boleta.propinaValor));
    if(v!=null) boletaPropinaInputOut.value = state.boleta.propinaUnit==='%' ? String(v) : formatEditableNumber(v);
    return;
  }
});

document.addEventListener('keydown', function(e: any){
  if(e.key==='Escape' && (state.openTxId || state.creatingNew || state.filterSheetOpen || state.linkFlow || state.boleta)) closeSheet();
});

// Prevents the browser from auto-scrolling the sheet when a button gets focus
// (that was causing the annoying jump when tapping actions inside the sheet).
phone.addEventListener('mousedown', function(e: any){
  const btn = e.target.closest('button');
  if(btn) e.preventDefault();
});

/* ---------- reorder Resumen sub-tabs with drag and drop ---------- */
// Works with both mouse and touch (Pointer Events unifies both). A small movement
// still counts as a normal tap (handled by the usual click); it only switches to "drag" if
// the finger/mouse moves past a threshold, and from there we reorder live while
// dragging, without touching the rest of the view (#resumen-content stays intact).
export const SUBTAB_DRAG_THRESHOLD = 6;
phone.addEventListener('pointerdown', function(e: any){
  if(e.button!=null && e.button!==0) return;
  const pill = e.target.closest('[data-summary-sub]');
  const container = document.getElementById('resumen-subtabs');
  if(!pill || !container) return;
  setSubtabDrag({
    id: pill.getAttribute('data-summary-sub'),
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
    subtabDrag.container.innerHTML = renderSummarySubtabsInner();
  }
  e.preventDefault();
  const hovered = document.elementFromPoint(e.clientX, e.clientY);
  const hoveredPill = hovered && hovered.closest && hovered.closest('[data-summary-sub]');
  if(!hoveredPill) return;
  const hoveredId = hoveredPill.getAttribute('data-summary-sub');
  if(hoveredId===subtabDrag.id) return;
  const order = state.summarySubOrder;
  const from = order.indexOf(subtabDrag.id);
  const to = order.indexOf(hoveredId);
  if(from===-1 || to===-1) return;
  order.splice(from,1);
  order.splice(to,0,subtabDrag.id);
  subtabDrag.container.innerHTML = renderSummarySubtabsInner();
});
export function endSubtabDrag(e){
  if(!subtabDrag || e.pointerId!==subtabDrag.pointerId) return;
  const wasDragging = subtabDrag.dragging;
  const container = subtabDrag.container;
  try{ container.releasePointerCapture(e.pointerId); }catch(err){}
  setSubtabDrag(null);
  state.subtabDragId = null;
  if(wasDragging){
    // The click (if the browser ends up firing it) happens synchronously right after
    // pointerup/mouseup within the same gesture — 0ms is enough to let it through
    // without risking blocking a real, later tap from the user.
    setSuppressNextSubtabClick(true);
    setTimeout(function(){ setSuppressNextSubtabClick(false); }, 0);
    container.innerHTML = renderSummarySubtabsInner();
  }
}
phone.addEventListener('pointerup', endSubtabDrag);
phone.addEventListener('pointercancel', endSubtabDrag);

export function overlayEl(){ return document.getElementById('sheet-overlay'); }

export function renderIfListVisible(){
  if(state.tab==='transacciones') renderTransactionsView();
  else if(state.tab==='resumen') renderSummarySubContent();
}
