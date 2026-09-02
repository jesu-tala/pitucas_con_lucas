const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 420, height: 1000 }, colorScheme: scheme });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message + '\n' + err.stack));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL')) errors.push('console: ' + msg.text()); });

    await page.goto('file://' + path.join(__dirname, 'test.html'));
    await page.waitForTimeout(300);

    await page.click('[data-tab="resumen"]');
    await page.waitForTimeout(150);
    await page.click('[data-resumen-sub="evolucion"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `shot10_${scheme}_01_evolucion.png`, fullPage: true });

    // confirm subtabs survived
    const subtabs = await page.$$eval('[data-resumen-sub]', els => els.length);
    console.log(scheme, 'subtabs visible on evolucion:', subtabs);

    // tap an earlier month bar group
    const groups = await page.$$('[data-evo-month]');
    console.log(scheme, 'month groups found:', groups.length);
    if (groups.length >= 2) {
      await groups[0].click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `shot10_${scheme}_02_month_selected.png`, fullPage: true });
      const label = await page.$eval('.evo-detail-month', el => el.textContent);
      console.log(scheme, 'selected month label:', label);
    }

    // scroll down to metas
    await page.evaluate(() => { document.getElementById('resumen-content').scrollTop = 900; });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot10_${scheme}_03_metas.png` });

    // edit an existing meta
    const editBtn = await page.$('[data-edit-meta]');
    if (editBtn) {
      const metaId = await editBtn.evaluate(el => el.getAttribute('data-edit-meta'));
      await editBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `shot10_${scheme}_04_meta_editing.png` });
      await page.fill('[data-meta-field="montoObjetivo"]', '3500000');
      await page.click(`[data-save-meta="${metaId}"]`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: `shot10_${scheme}_05_meta_saved.png` });
    }

    // toggle a monthly check chip
    const checkChip = await page.$('[data-toggle-meta-check]');
    if (checkChip) {
      await checkChip.click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: `shot10_${scheme}_06_check_toggled.png` });
    }

    // add a new goal
    const addLink = await page.$('[data-add-meta]');
    if (addLink) {
      await addLink.click();
      await page.waitForTimeout(200);
      await page.fill('[data-meta-field="nombre"]', 'Viaje a Japón');
      await page.fill('[data-meta-field="montoObjetivo"]', '2500000');
      await page.fill('[data-meta-field="aporteMensualMeta"]', '120000');
      await page.click('[data-save-meta="nueva"]');
      await page.waitForTimeout(200);
      await page.screenshot({ path: `shot10_${scheme}_07_meta_added.png`, fullPage: true });
    }

    // delete a goal (re-enter edit on first card)
    const editBtn2 = await page.$('[data-edit-meta]');
    if (editBtn2) {
      await editBtn2.click();
      await page.waitForTimeout(150);
      const delBtn = await page.$('[data-delete-meta]');
      if (delBtn) {
        await delBtn.click();
        await page.waitForTimeout(200);
        await page.screenshot({ path: `shot10_${scheme}_08_meta_deleted.png`, fullPage: true });
      }
    }

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
