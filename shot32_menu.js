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
    await page.click('[data-tab="menu"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `shot32_${scheme}_00_main.png`, fullPage: true });

    const itemLabels = await page.$$eval('[data-menu-open]', els => els.map(e => e.textContent.trim()));
    console.log(scheme, 'menu items:', JSON.stringify(itemLabels));

    // ---- 1. Categorias ----
    await page.click('[data-menu-open="categorias"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot32_${scheme}_01_categorias.png`, fullPage: true });
    await page.click('[data-add-cat]');
    await page.waitForTimeout(150);
    await page.fill('[data-cat-draft-field="nombre"]', 'Mascotas');
    await page.click('[data-cat-draft-icon="heart"]');
    await page.click('[data-cat-draft-color="pink"]');
    await page.waitForTimeout(100);
    await page.screenshot({ path: `shot32_${scheme}_02_cat_new_form.png`, fullPage: true });
    await page.click('[data-save-cat="nueva"]');
    await page.waitForTimeout(150);
    const hasMascotas = await page.evaluate(() => document.getElementById('view-root').textContent.includes('Mascotas'));
    console.log(scheme, 'nueva categoria Mascotas creada y visible:', hasMascotas);
    // edit an existing category (should not be able to change tipo)
    const editBtn = await page.$('[data-edit-cat="supermercado"]');
    await editBtn.click();
    await page.waitForTimeout(150);
    const tipoDisabled = await page.$eval('[data-seg="cat-draft-tipo"] button.active', el => el.disabled);
    console.log(scheme, 'tipo segmentado deshabilitado al editar existente:', tipoDisabled);
    const hasDeleteBlockedHint = await page.evaluate(() => document.getElementById('view-root').textContent.includes('tiene transacciones asociadas'));
    console.log(scheme, 'supermercado bloqueado para eliminar (tiene TX):', hasDeleteBlockedHint);
    await page.click('[data-cancel-cat-edit]');
    await page.waitForTimeout(100);
    // try delete the brand new Mascotas category (should be deletable, no TX)
    const newCatId = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('[data-edit-cat]')];
      const btn = btns.find(b => b.closest('.menu-item-card').textContent.includes('Mascotas'));
      return btn ? btn.getAttribute('data-edit-cat') : null;
    });
    console.log(scheme, 'newCatId:', newCatId);
    await page.click(`[data-edit-cat="${newCatId}"]`);
    await page.waitForTimeout(150);
    const hasDeleteLink = await page.$('[data-delete-cat]') !== null;
    console.log(scheme, 'Mascotas tiene link de eliminar (sin TX):', hasDeleteLink);
    await page.click(`[data-delete-cat="${newCatId}"]`);
    await page.waitForTimeout(150);
    const mascotasGone = await page.evaluate(() => !document.getElementById('view-root').textContent.includes('Mascotas'));
    console.log(scheme, 'Mascotas eliminada correctamente:', mascotasGone);
    await page.click('[data-menu-back]');
    await page.waitForTimeout(150);

    // ---- 2. Medios de pago ----
    await page.click('[data-menu-open="medios"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot32_${scheme}_03_medios.png`, fullPage: true });
    await page.click('[data-add-medio]');
    await page.waitForTimeout(150);
    await page.fill('[data-medio-draft-field="nombre"]', 'Mastercard Falabella');
    await page.fill('[data-medio-draft-field="corto"]', '•••• 5551');
    await page.click('[data-medio-draft-icon="card"]');
    await page.click('[data-save-medio="nueva"]');
    await page.waitForTimeout(150);
    const hasFalabella = await page.evaluate(() => document.getElementById('view-root').textContent.includes('Mastercard Falabella'));
    console.log(scheme, 'nuevo medio creado:', hasFalabella);
    // try delete a medio in use (visa_bch)
    await page.click('[data-edit-medio="visa_bch"]');
    await page.waitForTimeout(150);
    const visaBlockedHint = await page.evaluate(() => document.getElementById('view-root').textContent.includes('tiene transacciones asociadas'));
    console.log(scheme, 'visa_bch bloqueado para eliminar (en uso):', visaBlockedHint);
    await page.click('[data-cancel-medio-edit]');
    await page.waitForTimeout(100);
    await page.click('[data-menu-back]');
    await page.waitForTimeout(150);

    // ---- 3. Reglas ----
    await page.click('[data-menu-open="reglas"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot32_${scheme}_04_reglas.png`, fullPage: true });
    const reglaCount = await page.$$eval('.rule-card', els => els.length);
    console.log(scheme, 'reglas listadas:', reglaCount);
    if (reglaCount > 0) {
      const firstComercio = await page.$eval('.rule-card .rule-card-comercio', el => el.textContent);
      await page.click('.rule-card [data-delete-regla]');
      await page.waitForTimeout(150);
      const newCount = await page.$$eval('.rule-card', els => els.length);
      console.log(scheme, 'regla eliminada, count antes/despues:', reglaCount, newCount, 'comercio:', firstComercio);
    }
    await page.click('[data-menu-back]');
    await page.waitForTimeout(150);

    // ---- 4. Exportar CSV ----
    await page.click('[data-menu-open="exportar"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot32_${scheme}_05_exportar.png`, fullPage: true });
    const [download1] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-export-csv]')
    ]);
    const csvPath = await download1.path();
    const fs = require('fs');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    console.log(scheme, 'CSV descargado, primera linea:', csvContent.split('\n')[0].replace(/^﻿/, ''));
    console.log(scheme, 'CSV lineas totales (header+filas):', csvContent.trim().split('\n').length);
    await page.click('[data-menu-back]');
    await page.waitForTimeout(150);

    // ---- 5. Respaldo JSON ----
    await page.click('[data-menu-open="respaldo"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot32_${scheme}_06_respaldo.png`, fullPage: true });
    const [download2] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-export-json]')
    ]);
    const jsonPath = await download2.path();
    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(scheme, 'JSON descargado, keys:', Object.keys(jsonContent).join(','), '| transacciones:', jsonContent.transacciones.length);
    await page.click('[data-menu-back]');
    await page.waitForTimeout(150);

    // ---- 6. Importar CSV ----
    await page.click('[data-menu-open="importar"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot32_${scheme}_07_importar_empty.png`, fullPage: true });
    const csvImportContent = 'fecha,descripcion,monto\n2026-08-20,Netflix,-7990\n2026-08-19,Sueldo Agosto,1250000\n2026-08-18,Comercio Nuevo XYZ,-9000\n';
    const tmpCsvPath = path.join(__dirname, 'test_import.csv');
    fs.writeFileSync(tmpCsvPath, csvImportContent, 'utf-8');
    await page.setInputFiles('[data-csv-file-input]', tmpCsvPath);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shot32_${scheme}_08_importar_resultado.png`, fullPage: true });
    const importSummaryTxt = await page.evaluate(() => document.getElementById('view-root').textContent);
    console.log(scheme, 'resumen import texto:', importSummaryTxt.replace(/\s+/g,' ').trim());
    await page.click('[data-menu-back]');
    await page.waitForTimeout(150);

    // verify imported Netflix tx got auto-categorized via existing regla (comercio match), and the
    // brand-new "Comercio Nuevo XYZ" (no regla) landed as pendiente
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(200);
    const netflixImportedTxt = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tx-item')];
      const found = items.find(i => i.textContent.includes('Netflix') && i.textContent.includes('7.990'));
      return found ? found.textContent.replace(/\s+/g,' ').trim() : null;
    });
    console.log(scheme, 'Netflix importado (debe verse ya categorizado x2):', netflixImportedTxt);
    const nuevoXyzTxt = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.tx-item')];
      const found = items.find(i => i.textContent.includes('Comercio Nuevo XYZ'));
      return found ? found.textContent.replace(/\s+/g,' ').trim() : null;
    });
    console.log(scheme, 'Comercio Nuevo XYZ importado (debe verse pendiente):', nuevoXyzTxt);
    await page.click('[data-tab="menu"]');
    await page.waitForTimeout(150);

    // ---- 7. Modo demo ----
    await page.click('[data-menu-open="demo"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot32_${scheme}_09_demo_off.png`, fullPage: true });
    await page.click('[data-toggle-demo]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot32_${scheme}_10_demo_on.png`, fullPage: true });
    const bannerVisible = await page.evaluate(() => !document.getElementById('demo-banner').hidden);
    console.log(scheme, 'demo banner visible tras activar:', bannerVisible);
    await page.click('[data-tab="transacciones"]');
    await page.waitForTimeout(150);
    const maskedAmount = await page.evaluate(() => document.getElementById('view-root').textContent.includes('$••••••'));
    console.log(scheme, 'montos enmascarados en Transacciones:', maskedAmount);
    await page.screenshot({ path: `shot32_${scheme}_11_demo_transacciones.png`, fullPage: true });
    await page.click('[data-tab="menu"]');
    await page.waitForTimeout(150);
    // menuSection persiste entre tabs (mismo patrón que resumenSub) — ya estamos en la pantalla "demo"
    await page.click('[data-toggle-demo]');
    await page.waitForTimeout(150);
    const bannerHiddenAgain = await page.evaluate(() => document.getElementById('demo-banner').hidden);
    console.log(scheme, 'demo banner oculto tras desactivar:', bannerHiddenAgain);
    await page.click('[data-menu-back]');
    await page.waitForTimeout(150);

    // ---- 8. Asesoria ----
    await page.click('[data-menu-open="asesoria"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot32_${scheme}_12_asesoria.png`, fullPage: true });
    const hasProximamente = await page.evaluate(() => document.getElementById('view-root').textContent.includes('Próximamente'));
    console.log(scheme, 'asesoria muestra Proximamente:', hasProximamente);
    await page.click('[data-menu-back]');
    await page.waitForTimeout(150);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
