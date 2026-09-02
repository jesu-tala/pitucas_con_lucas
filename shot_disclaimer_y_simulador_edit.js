// Dos pedidos juntos sobre la pestaña Inversiones:
// (A) el disclaimer legal ("Herramienta de orden personal...") se movió del pie del
//     planificador (alineado a la derecha) al final de TODA la pestaña (después del simulador),
//     centrado, y con el texto actualizado ("...con una persona profesional licenciada").
// (B) el simulador: se sacó la línea "Sin retorno" y ahora el "Aportando $X/mes" es un campo
//     editable (antes era texto fijo) -- con el promedio real de los últimos 3 meses como
//     placeholder, y una nueva leyenda que muestra ese mismo promedio como referencia.
const { openApp, check, finish } = require('./lib/test_kit');

(async () => {
  const { context, browser, page, errors } = await openApp();

  await page.click('[data-tab="resumen"]');
  await page.waitForTimeout(150);
  await page.click('[data-resumen-sub="inversiones"]');
  await page.waitForTimeout(200);

  // ---------- (A) Disclaimer ----------
  const disclaimer = await page.evaluate(() => {
    const root = document.getElementById('resumen-content');
    const el = document.querySelector('.plan-disclaimer');
    if (!el) return null;
    const cards = [...root.children];
    const idxProyeccion = cards.findIndex(c => c.classList.contains('proyeccion-card'));
    const idxDisclaimer = cards.indexOf(el);
    return {
      texto: el.textContent.trim(),
      textAlign: getComputedStyle(el).textAlign,
      despuesDelSimulador: idxDisclaimer > idxProyeccion,
    };
  });
  check('El disclaimer existe y tiene el texto actualizado ("una persona profesional licenciada")', disclaimer && disclaimer.texto.includes('una persona profesional licenciada'), disclaimer);
  check('Ya no dice "un profesional licenciado" (sin "una persona")', disclaimer && !disclaimer.texto.includes('con un profesional licenciado'), disclaimer);
  check('El disclaimer está centrado', disclaimer && disclaimer.textAlign === 'center', disclaimer);
  check('El disclaimer quedó DESPUÉS del simulador (al final de la pestaña)', disclaimer && disclaimer.despuesDelSimulador === true, disclaimer);

  // ---------- (B) Simulador editable ----------
  const antes = await page.evaluate(() => {
    const input = document.querySelector('[data-proy-aporte-input]');
    return {
      esInput: input && input.tagName === 'INPUT',
      valorVacio: input ? input.value === '' : null,
      placeholder: input ? input.placeholder : null,
      dicesinRetorno: document.body.textContent.includes('Sin retorno'),
      caption: document.querySelector('.proyeccion-caption')?.textContent || '',
      totalTexto: document.querySelector('[data-proy-total]')?.textContent || '',
    };
  });
  check('"Aportando .../mes" ahora es un campo editable', antes.esInput === true, antes);
  check('Por defecto viene vacío (usa el promedio real como placeholder)', antes.valorVacio === true, antes);
  check('El placeholder no está vacío (muestra el promedio de los últimos 3 meses)', !!antes.placeholder && antes.placeholder !== '0', antes);
  check('Ya no aparece la línea "Sin retorno"', antes.dicesinRetorno === false, antes);
  check('La nueva leyenda muestra el promedio de los últimos 3 meses como referencia', antes.caption.includes('Promedio de tus últimas 3 inversiones mensuales'), antes);

  // Escribir un aporte propio, más alto que el promedio, debe subir el total proyectado.
  await page.fill('[data-proy-aporte-input]', '9999999');
  await page.waitForTimeout(150);
  const conAporteAlto = await page.evaluate(() => ({
    draftValue: window.__debug.state.proySimulatedAporte,
    totalTexto: document.querySelector('[data-proy-total]')?.textContent || '',
  }));
  check('Escribir un aporte propio actualiza el estado (proySimulatedAporte)', conAporteAlto.draftValue === 9999999, conAporteAlto);
  check('...y el total proyectado sube respecto al de antes', conAporteAlto.totalTexto !== antes.totalTexto, { antes: antes.totalTexto, despues: conAporteAlto.totalTexto });

  // Vaciar el campo vuelve a usar el promedio real (null).
  await page.fill('[data-proy-aporte-input]', '');
  await page.waitForTimeout(150);
  const vacioDeNuevo = await page.evaluate(() => window.__debug.state.proySimulatedAporte);
  check('Vaciar el campo vuelve a dejarlo en null (usa el promedio real de nuevo)', vacioDeNuevo === null, vacioDeNuevo);

  await finish({ context, browser, errors });
})();
