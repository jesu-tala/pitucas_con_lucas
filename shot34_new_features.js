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

    // ============ PARTE A: propina en el wizard de boleta ============
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tx-item')];
      const found = items.find(i => i.textContent.includes('Cine Hoyts Costanera'));
      found.click();
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#sheet-content .action-btn')];
      const found = btns.find(b => b.textContent.includes('Cobro o reembolso pendiente'));
      found.click();
    });
    await page.waitForTimeout(150);
    await page.click('[data-open-boleta]');
    await page.waitForTimeout(150);
    await page.click('[data-boleta-capture="camara"]');
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `shot34_${scheme}_00_items.png`, fullPage: true });

    // propina: chip rapido 10%
    const propinaCardExists = await page.$('.boleta-propina-card') !== null;
    console.log(scheme, 'tarjeta de propina visible en items:', propinaCardExists);
    await page.click('[data-boleta-propina-quick="10"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot34_${scheme}_01_propina_10.png`, fullPage: true });
    const summaryAfter10 = await page.evaluate(() => document.getElementById('boleta-totals-summary').textContent.replace(/\s+/g,' ').trim());
    console.log(scheme, 'resumen con 10% propina:', summaryAfter10);

    // cambiar a monto fijo
    await page.click('[data-boleta-propina-unit="$"]');
    await page.waitForTimeout(100);
    await page.fill('[data-boleta-propina-input]', '2000');
    await page.press('[data-boleta-propina-input]', 'Tab');
    await page.waitForTimeout(150);
    const summaryFixed = await page.evaluate(() => document.getElementById('boleta-totals-summary').textContent.replace(/\s+/g,' ').trim());
    console.log(scheme, 'resumen con propina fija $2000:', summaryFixed);

    // volver a 15% para el resto del flujo
    await page.click('[data-boleta-propina-unit="%"]');
    await page.waitForTimeout(100);
    await page.click('[data-boleta-propina-quick="15"]');
    await page.waitForTimeout(150);

    await page.click('[data-boleta-goto="asignar"]');
    await page.waitForTimeout(150);
    const toggleBtns = await page.$$eval('[data-boleta-toggle-person]', els => els.map(e => e.getAttribute('data-boleta-toggle-person')));
    const byItem = {};
    toggleBtns.forEach(v => { const [id, p] = v.split('|'); (byItem[id] = byItem[id]||[]).push(p); });
    const itemIds = Object.keys(byItem);
    for (let i = 0; i < itemIds.length; i++) {
      const people = byItem[itemIds[i]];
      const assignTo = i === 0 ? people.slice(0,2) : [people[1] || people[0]];
      for (const p of assignTo) {
        await page.click(`[data-boleta-toggle-person="${itemIds[i]}|${p}"]`);
        await page.waitForTimeout(60);
      }
    }
    await page.waitForTimeout(100);
    await page.click('[data-boleta-goto="resumen"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot34_${scheme}_02_resumen_con_propina.png`, fullPage: true });
    const resumenShowsSinYCon = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.boleta-total-row')];
      return rows.some(r => r.textContent.includes('sin propina')) || document.getElementById('sheet-content').textContent.includes('sin propina');
    });
    console.log(scheme, 'resumen muestra montos sin/con propina:', resumenShowsSinYCon);

    const txCountBeforeSave = await page.evaluate(() => document.querySelectorAll('.tx-item').length);
    await page.click('[data-boleta-guardar]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `shot34_${scheme}_03_guardado_con_propina.png`, fullPage: true });
    const sheetAfterSave = await page.evaluate(() => document.getElementById('sheet-content').textContent.replace(/\s+/g,' ').trim());
    console.log(scheme, 'sigue siendo Cine Hoyts Costanera tras guardar con propina:', sheetAfterSave.includes('Cine Hoyts Costanera'));
    console.log(scheme, 'monto del gasto original NO cambia (debe seguir en $12.000):', sheetAfterSave.includes('12.000'));
    const tuParteTxt = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.split-remaining')].find(r => r.textContent.includes('Tu parte del gasto'));
      return row ? row.textContent.replace(/\s+/g,' ').trim() : null;
    });
    console.log(scheme, 'indicador "Tu parte del gasto" tras propina (debe reflejar que el reparto supera el gasto):', tuParteTxt);
    await page.evaluate(() => { const btn = document.getElementById('sheet-close-btn'); if (btn) btn.click(); });
    await page.waitForTimeout(150);
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    const txCountAfterSave = await page.evaluate(() => document.querySelectorAll('.tx-item').length);
    console.log(scheme, 'transacciones antes/despues de guardar boleta con propina (debe ser igual):', txCountBeforeSave, txCountAfterSave);

    // ============ PARTE B: crear nueva plataforma de inversion ============
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="inversiones"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot34_${scheme}_04_inversiones_antes.png`, fullPage: true });
    const explainerVisible = await page.evaluate(() => document.getElementById('view-root').textContent.includes('para sumar una plataforma nueva usa el botón de arriba'));
    console.log(scheme, 'texto explicativo de "aporte o retiro manual" visible:', explainerVisible);
    await page.click('[data-add-platform]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot34_${scheme}_05_nueva_plataforma_form.png`, fullPage: true });
    await page.fill('[data-newplatform-field="nombre"]', 'Banco Santander');
    await page.click('[data-newplatform-icon="bank"]');
    await page.click('[data-newplatform-color="sky"]');
    await page.fill('[data-newplatform-field="valor"]', '300000');
    await page.waitForTimeout(100);
    await page.click('[data-save-newplatform]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot34_${scheme}_06_nueva_plataforma_creada.png`, fullPage: true });
    const platformAppears = await page.evaluate(() => document.getElementById('view-root').textContent.includes('Banco Santander'));
    console.log(scheme, 'Banco Santander aparece en Mis plataformas:', platformAppears);
    const chartStillShowsAllMonths = await page.evaluate(() => {
      const el = document.querySelector('.combo-chart, .platform-chart, [data-platform-chart]');
      return el ? el.textContent.length > 0 : 'no-selector-found';
    });
    console.log(scheme, 'chequeo generico de chart tras crear plataforma (informativo):', chartStillShowsAllMonths);
    // verificar en Menu > Categorias
    await page.click('[data-tab="menu"]');
    await page.waitForTimeout(150);
    await page.click('[data-menu-open="categorias"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot34_${scheme}_07_menu_categorias.png`, fullPage: true });
    const santanderInCategorias = await page.evaluate(() => document.getElementById('view-root').textContent.includes('Banco Santander'));
    console.log(scheme, 'Banco Santander aparece en Menu > Categorias (inversiones):', santanderInCategorias);
    await page.click('[data-menu-back]');
    await page.waitForTimeout(150);

    // ============ PARTE C: modo demo enmascara totales en Resumen ============
    await page.click('[data-menu-open="demo"]');
    await page.waitForTimeout(200);
    await page.click('[data-toggle-demo]');
    await page.waitForTimeout(200);
    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="balance"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot34_${scheme}_08_demo_balance_donut.png`, fullPage: true });
    const donutMasked = await page.evaluate(() => document.getElementById('view-root').textContent.includes('••••••'));
    console.log(scheme, 'donut central enmascarado en modo demo:', donutMasked);
    // volver a apagar el modo demo para dejar estado limpio (el tab "menu" recuerda que
    // estabamos en la seccion "demo", asi que ya estamos en esa pantalla al volver)
    await page.click('[data-tab="menu"]');
    await page.waitForTimeout(150);
    await page.click('[data-toggle-demo]');
    await page.waitForTimeout(150);

    // ============ PARTE D: boton "dar por perdida" ============
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tx-item')];
      const found = items.find(i => i.textContent.includes('Uber'));
      found.click();
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#sheet-content .action-btn')];
      const found = btns.find(b => b.textContent.includes('Cobro o reembolso pendiente'));
      found.click();
    });
    await page.waitForTimeout(150);
    await page.click('[data-add-cobrorow]');
    await page.waitForTimeout(150);
    await page.fill('[data-cobro-name="0"]', 'Tomás');
    await page.fill('[data-cobro-amount="0"]', '3000');
    await page.press('[data-cobro-amount="0"]', 'Tab');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot34_${scheme}_09_cobro_row_added.png`, fullPage: true });
    const darPorPerdidaVisible = await page.$('[data-dar-por-perdida="0"]') !== null;
    console.log(scheme, 'link "Dar por perdida" visible en fila no pagada:', darPorPerdidaVisible);
    const txCountBeforePerdida = await page.evaluate(() => {
      // contar via export json seria mas confiable, pero usamos el DOM de transacciones tras cerrar
      return null;
    });
    await page.click('[data-dar-por-perdida="0"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `shot34_${scheme}_10_dar_por_perdida_resultado.png`, fullPage: true });
    const uberSheetAfter = await page.evaluate(() => document.getElementById('sheet-content').textContent.replace(/\s+/g,' ').trim());
    console.log(scheme, 'sheet de Uber ya no muestra el pendiente de Tomás:', !uberSheetAfter.includes('Tomás'));
    await page.evaluate(() => { const btn = document.getElementById('sheet-close-btn'); if (btn) btn.click(); });
    await page.waitForTimeout(150);
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    const nuevaTxPerdida = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tx-item')];
      return items.some(i => i.textContent.includes('nunca pagó'));
    });
    console.log(scheme, 'nueva transaccion de gasto "nunca pagó" creada tras dar por perdida:', nuevaTxPerdida);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
