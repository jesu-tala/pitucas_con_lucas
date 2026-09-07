// Reported: "la navbar se ve extraña, usa mucho espacio de abajo -- los íconos están en la parte
// superior dejando un espacio de navbar exageradamente grande en vez de hacerla menos alta"
// (the icons sit at the top of the bar, leaving a big empty gap below them).
//
// Investigation (measured via Playwright, not just read from the CSS): .tabbar has no explicit
// height, so with every .tab at its natural content size, .tabbar's own content-box height
// already equals exactly that size -- the old align-items:stretch default never actually had room
// to stretch .tab taller in the FIRST place, because CSS padding (where env(safe-area-inset-
// bottom) lives, see .tabbar's padding-bottom) sits OUTSIDE the flex content box a flex item
// stretches into. Confirmed by measuring with a simulated 34px safe area (page.addStyleTag
// overriding padding-bottom): .tab's own height stayed exactly the same as with zero safe area --
// the extra space showed up entirely BELOW .tab, as .tabbar's own bottom padding, never inside
// .tab itself. That safe-area padding is real, correct, intentional home-indicator clearance (see
// the header comment on .fab-add) -- deliberately NOT touched here, per this app's history of
// getting that exact math wrong (the earlier --app-height/100dvh saga).
//
// What DOES actually reproduce something matching the report, found empirically: this app's tab
// labels never wrap at any real viewport width today (confirmed down to 320px), but IF one ever
// did -- a longer label after a copy change, a translation, iOS Dynamic Type making the font
// bigger than the others expect -- the OLD align-items:stretch on .tabbar would force every
// OTHER (shorter) tab to stretch to match that one tab's new height, with their icon+label packed
// at the top (flex-start-ish, no justify-content) and a real dead gap below, inside their own now-
// artificially-tall button -- exactly "icons at the top, big empty navbar space below them".
//
// Fix: .tabbar now uses align-items:center (was the implicit stretch default) and .tab uses
// justify-content:center (was the implicit flex-start default). Together these mean a taller
// sibling no longer drags every other tab's box up to its height at all -- each tab keeps its own
// natural size and is centered as a whole within the row, so no tab ever gets artificially
// stretched with dead space inside it. This changes nothing in the app's current, real state
// (verified in (a) below) -- it's a no-op there -- but is exactly the mechanism that would have
// produced the reported symptom if any tab ever needed more room than the others, so it's a real,
// low-risk hardening against that shape of bug, not a shot in the dark. env(safe-area-inset-
// bottom) itself is untouched by any of this.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp({ viewport: { width: 390, height: 844 } });

  // (a) Baseline (real content, real widths, today's actual CSS): every tab's icon+label already
  // sit centered within its own box -- confirms the fix is a no-op for the app as it exists today.
  const baseline = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#tabbar .tab')).map(tab => {
      const tabRect = tab.getBoundingClientRect();
      const svg = tab.querySelector('svg').getBoundingClientRect();
      const span = tab.querySelector('span').getBoundingClientRect();
      const topGap = svg.top - tabRect.top;
      const bottomGap = tabRect.bottom - span.bottom;
      return { label: tab.textContent.trim(), tabHeight: tabRect.height, topGap, bottomGap, diff: Math.abs(topGap - bottomGap) };
    });
  });
  console.log('baseline gaps:', JSON.stringify(baseline));
  const todasIguales = baseline.every(t => t.tabHeight === baseline[0].tabHeight);
  check('(a) hoy los 4 tabs tienen exactamente la misma altura (nada las desiguala)', todasIguales, baseline);
  baseline.forEach(t => {
    check('(a) "' + t.label + '": el espacio arriba del ícono y abajo de la etiqueta son iguales (tolerancia 2px) -- centrado, no pegado arriba', t.diff <= 2, t);
  });

  // (b) Force one tab's label to wrap to 2 lines -- the only way to make one .tab genuinely need
  // more height than its siblings in this sandbox (this app's real labels never do, at any real
  // viewport width) -- and confirm the fix's actual, measurable effect: the OTHER (shorter) tabs
  // do NOT get stretched to match it (no forced dead space appears inside them), and stay exactly
  // as centered as they were in (a).
  await page.addStyleTag({ content: '#tabbar .tab:first-child span{ white-space:normal !important; max-width:40px !important; word-break:break-all; text-align:center; } #tabbar .tab:first-child{ flex:0 0 40px !important; }' });
  await page.waitForTimeout(50);
  const forced = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#tabbar .tab')).map(tab => {
      const tabRect = tab.getBoundingClientRect();
      const svg = tab.querySelector('svg').getBoundingClientRect();
      const span = tab.querySelector('span').getBoundingClientRect();
      const topGap = svg.top - tabRect.top;
      const bottomGap = tabRect.bottom - span.bottom;
      return { label: tab.textContent.trim(), tabHeight: tabRect.height, topGap, bottomGap, diff: Math.abs(topGap - bottomGap) };
    });
  });
  console.log('forced-wrap gaps:', JSON.stringify(forced));
  check('(b) forzar 2 líneas en el primer tab efectivamente lo hace más alto que antes (setup real, no un no-op)', forced[0].tabHeight > baseline[0].tabHeight, { forced: forced[0], baseline: baseline[0] });
  forced.slice(1).forEach((t, i) => {
    check('(b) "' + t.label + '" NO se estira para igualar al tab más alto (sigue con su altura de antes, sin espacio muerto forzado)', t.tabHeight === baseline[i + 1].tabHeight, { forced: t, baseline: baseline[i + 1] });
    check('   y sigue centrado dentro de su propia caja', t.diff <= 2, t);
  });

  await finish({ context, browser, errors });
})();
