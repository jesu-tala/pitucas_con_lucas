const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 950 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message + '\n' + err.stack));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('TUNNEL')) errors.push('console: ' + msg.text()); });

    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.evaluate(() => { const g = document.getElementById('auth-gate'); if (g) g.hidden = true; });
    await page.waitForTimeout(300);

    // ============ PARTE A: reembolso de monto desconocido (t8, Farmacias Ahumada) ============
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    // abrir Farmacias Ahumada (tiene un reembolso pendiente con monto null)
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tx-item')];
      const found = items.find(i => i.textContent.includes('Farmacias Ahumada'));
      found.click();
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot33_${scheme}_00_reembolso_pendiente.png`, fullPage: true });
    const showsPorConfirmar = await page.evaluate(() => {
      const input = document.querySelector('#sheet-content [data-cobro-amount]');
      return input ? input.getAttribute('placeholder') === 'Por confirmar' : false;
    });
    console.log(scheme, 'reembolso monto desconocido muestra placeholder "Por confirmar":', showsPorConfirmar);
    // vincular desde el pendiente -> elegir un ingreso libre (no vinculado todavia): "Freelance diseño web" 20 de agosto
    await page.click('[data-link-pendiente]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot33_${scheme}_01_link_from_pendiente.png`, fullPage: true });
    const pickRows = await page.$$('[data-pick-ingreso]');
    console.log(scheme, 'opciones de ingreso para vincular:', pickRows.length);
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-pick-ingreso]')];
      const found = rows.find(r => r.textContent.includes('20 de agosto') && r.textContent.includes('Freelance'));
      (found || rows[0]).click();
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot33_${scheme}_02_after_link.png`, fullPage: true });
    const nowResolved = await page.evaluate(() => {
      const txt = document.getElementById('sheet-content').textContent;
      return txt.includes('180.000');
    });
    console.log(scheme, 'reembolso resuelto muestra monto recibido 180.000:', nowResolved);
    // ---- verificar tarjeta "Reembolsado este mes" en Balance (mismo mes, agosto = mes actual) ----
    await page.evaluate(() => { const btn = document.getElementById('sheet-close-btn'); if (btn) btn.click(); });
    await page.waitForTimeout(150);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot33_${scheme}_03_balance_reembolso_card.png`, fullPage: true });
    const hasReembolsoCard = await page.evaluate(() => document.getElementById('view-root').textContent.includes('Reembolsado este mes'));
    console.log(scheme, 'tarjeta Reembolsado este mes visible tras vincular:', hasReembolsoCard);

    // ============ PARTE B: vincular desde el lado del ingreso (t71 ya viene vinculado en la data semilla -> probar unlink/relink) ============
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tx-item')];
      const found = items.find(i => i.textContent.includes('Reembolso Isapre'));
      found.click();
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot33_${scheme}_04_ingreso_vinculado.png`, fullPage: true });
    const showsVinculadoA = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Vinculado a'));
    console.log(scheme, 'ingreso muestra "Vinculado a" tras el link:', showsVinculadoA);
    await page.click('[data-unlink-ingreso]');
    await page.waitForTimeout(200);
    const showsVincularBtn = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Vincular a un pendiente'));
    console.log(scheme, 'tras quitar vinculo, boton "Vincular a un pendiente" reaparece:', showsVincularBtn);
    // re-vincular desde el lado del ingreso (fromIngreso) para dejar el estado consistente para el resto del run
    await page.click('[data-open-link-ingreso]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot33_${scheme}_05_link_from_ingreso.png`, fullPage: true });
    const pendRows = await page.$$('[data-pick-pendiente]');
    console.log(scheme, 'opciones de pendientes globales para vincular desde ingreso:', pendRows.length);
    if (pendRows.length > 0) {
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-pick-pendiente]')];
        // el pendiente que acabamos de desvincular es el de "Seguro complementario" (Farmacias Cruz Verde) —
        // buscarlo por nombre real, no por el comercio del depósito (evita enganchar por error otro pendiente sin relación)
        const found = rows.find(r => r.textContent.includes('Seguro complementario'));
        if (!found) throw new Error('No se encontró el pendiente "Seguro complementario" para re-vincular');
        found.click();
      });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `shot33_${scheme}_06_after_link_from_ingreso.png`, fullPage: true });
    }
    await page.evaluate(() => { const btn = document.getElementById('sheet-close-btn'); if (btn) btn.click(); });
    await page.waitForTimeout(150);

    // ============ PARTE C: agregar fila de reembolso nueva en un gasto existente ============
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tx-item')];
      const found = items.find(i => i.textContent.includes('Restobar Lastarria'));
      found.click();
    });
    await page.waitForTimeout(200);
    const cobroBtn = await page.$('[data-action="marcar_por_cobrar"], [data-action="cobro_reembolso"]');
    // el boton pudo renombrarse; buscar cualquier action-btn que abra el split de cobros
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.action-btn, [data-toggle-cobrosplit]')];
      const found = btns.find(b => b.textContent.includes('Cobro') || b.hasAttribute('data-toggle-cobrosplit'));
      if (found) found.click();
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot33_${scheme}_07_gasto_cobros_block.png`, fullPage: true });
    const addReembolsoBtnExists = await page.$('[data-add-reembolsorow]') !== null;
    console.log(scheme, 'boton agregar fila de reembolso existe:', addReembolsoBtnExists);
    if (addReembolsoBtnExists) {
      await page.click('[data-add-reembolsorow]');
      await page.waitForTimeout(150);
      await page.screenshot({ path: `shot33_${scheme}_08_reembolso_row_added.png`, fullPage: true });
      const hasReembolsoTag = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Reembolso'));
      console.log(scheme, 'nueva fila muestra tag Reembolso:', hasReembolsoTag);
    }
    await page.evaluate(() => { const btn = document.getElementById('sheet-close-btn'); if (btn) btn.click(); });
    await page.waitForTimeout(150);

    // ============ PARTE D: wizard completo de dividir boleta ============
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    // el flujo ahora vive DENTRO de una transaccion real: la marcamos "por cobrar" primero, y ahi
    // aparece la opcion de subir la boleta (nada de crear una transaccion nueva y duplicada)
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tx-item')];
      const found = items.find(i => i.textContent.includes('Cine Hoyts Costanera'));
      found.click();
    });
    await page.waitForTimeout(200);
    const noEntryButtonYet = await page.$('[data-open-boleta]') === null;
    console.log(scheme, 'boton de subir boleta NO aparece antes de marcar por cobrar:', noEntryButtonYet);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#sheet-content .action-btn')];
      const found = btns.find(b => b.textContent.includes('Cobro o reembolso pendiente'));
      found.click();
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot33_${scheme}_09_entry_button.png`, fullPage: true });
    const entryBtnExists = await page.$('[data-open-boleta]') !== null;
    console.log(scheme, 'boton "Subir foto de la boleta" aparece tras marcar por cobrar:', entryBtnExists);
    await page.click('[data-open-boleta]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot33_${scheme}_10_boleta_capturar.png`, fullPage: true });
    await page.click('[data-boleta-capture="camara"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot33_${scheme}_11_boleta_procesando.png`, fullPage: true });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `shot33_${scheme}_12_boleta_items.png`, fullPage: true });
    const itemCount = await page.$$eval('[data-boleta-item-row]', els => els.length);
    console.log(scheme, 'items detectados en la boleta simulada:', itemCount);
    // editar el nombre y monto del primer item
    await page.fill('[data-boleta-item-nombre="0"]', 'Roll California (editado)');
    await page.fill('[data-boleta-item-monto="0"]', '15000');
    await page.press('[data-boleta-item-monto="0"]', 'Tab');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot33_${scheme}_13_boleta_item_editado.png`, fullPage: true });
    // agregar un item nuevo
    await page.click('[data-boleta-add-item]');
    await page.waitForTimeout(100);
    const itemCountAfterAdd = await page.$$eval('[data-boleta-item-row]', els => els.length);
    console.log(scheme, 'items despues de agregar uno:', itemCountAfterAdd);
    const newIdx = itemCountAfterAdd - 1;
    await page.fill(`[data-boleta-item-nombre="${newIdx}"]`, 'Postre compartido');
    await page.fill(`[data-boleta-item-monto="${newIdx}"]`, '5000');
    await page.press(`[data-boleta-item-monto="${newIdx}"]`, 'Tab');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot33_${scheme}_14_boleta_item_agregado.png`, fullPage: true });
    // eliminar un item (el ultimo agregado, para simplificar el resto del flujo)
    await page.click(`[data-boleta-item-remove="${newIdx}"]`);
    await page.waitForTimeout(100);
    const itemCountAfterRemove = await page.$$eval('[data-boleta-item-row]', els => els.length);
    console.log(scheme, 'items despues de eliminar uno:', itemCountAfterRemove);
    await page.click('[data-boleta-goto="asignar"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot33_${scheme}_15_boleta_asignar_vacio.png`, fullPage: true });
    // el boton continuar debe estar deshabilitado si hay items sin asignar
    const continueDisabledInitially = await page.$eval('[data-boleta-goto="resumen"]', el => el.disabled);
    console.log(scheme, 'boton continuar deshabilitado con items sin asignar:', continueDisabledInitially);
    // asignar cada item a al menos una persona (mezclando "Yo" y un amigo, y un item compartido)
    const toggleBtns = await page.$$eval('[data-boleta-toggle-person]', els => els.map(e => e.getAttribute('data-boleta-toggle-person')));
    console.log(scheme, 'opciones de asignacion disponibles (primeras 6):', JSON.stringify(toggleBtns.slice(0,6)));
    // agrupar por itemId
    const byItem = {};
    toggleBtns.forEach(v => { const [id, p] = v.split('|'); (byItem[id] = byItem[id]||[]).push(p); });
    const itemIds = Object.keys(byItem);
    for (let i = 0; i < itemIds.length; i++) {
      const people = byItem[itemIds[i]];
      // el primer item se asigna a 2 personas (compartido), el resto a 1
      const assignTo = i === 0 ? people.slice(0,2) : [people[1] || people[0]];
      for (const p of assignTo) {
        await page.click(`[data-boleta-toggle-person="${itemIds[i]}|${p}"]`);
        await page.waitForTimeout(60);
      }
    }
    await page.waitForTimeout(100);
    await page.screenshot({ path: `shot33_${scheme}_16_boleta_asignado.png`, fullPage: true });
    const continueEnabledNow = await page.$eval('[data-boleta-goto="resumen"]', el => el.disabled);
    console.log(scheme, 'boton continuar habilitado tras asignar todo:', !continueEnabledNow);
    await page.click('[data-boleta-goto="resumen"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot33_${scheme}_17_boleta_resumen.png`, fullPage: true });
    const hasProximamenteNote = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Próximamente'));
    console.log(scheme, 'resumen muestra nota "Próximamente" en vez del link de compartir:', hasProximamenteNote);
    const noShareBoxAnymore = await page.evaluate(() => !document.getElementById('sheet-content').textContent.includes('plata-clara.app'));
    console.log(scheme, 'ya no se genera un link falso para compartir:', noShareBoxAnymore);
    // guardar el reparto EN LA MISMA transaccion (no debe crear una nueva)
    const txCountBefore = await page.evaluate(() => document.querySelectorAll('.tx-item').length);
    await page.click('[data-boleta-guardar]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `shot33_${scheme}_19_boleta_guardado.png`, fullPage: true });
    const sheetTitle = await page.evaluate(() => document.getElementById('sheet-content').textContent);
    console.log(scheme, 'sheet abierto tras guardar (debe seguir siendo Cine Hoyts Costanera):', sheetTitle.replace(/\s+/g,' ').trim().slice(0,150));
    const stillSameTx = sheetTitle.includes('Cine Hoyts Costanera');
    console.log(scheme, 'sigue siendo la MISMA transaccion (no se duplico):', stillSameTx);
    const hasPorCobrarBlock = await page.evaluate(() => document.getElementById('sheet-content').textContent.includes('Cobros y reembolsos pendientes'));
    console.log(scheme, 'la transaccion existente ahora muestra el reparto:', hasPorCobrarBlock);
    await page.evaluate(() => { const btn = document.getElementById('sheet-close-btn'); if (btn) btn.click(); });
    await page.waitForTimeout(150);
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    const txCountAfter = await page.evaluate(() => document.querySelectorAll('.tx-item').length);
    console.log(scheme, 'cantidad de transacciones antes/despues de guardar boleta (debe ser igual, sin duplicados):', txCountBefore, txCountAfter);
    const cineAppearsOnce = await page.evaluate(() => [...document.querySelectorAll('.tx-item')].filter(i => i.textContent.includes('Cine Hoyts Costanera')).length);
    console.log(scheme, 'Cine Hoyts Costanera aparece exactamente 1 vez en la lista:', cineAppearsOnce);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
