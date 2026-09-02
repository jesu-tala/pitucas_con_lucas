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
    await page.waitForTimeout(800); // le da tiempo a que se resuelva sb.auth.getSession()/el intento de cargar el CDN (bloqueado en este sandbox)

    await page.screenshot({ path: `shot41_${scheme}_00_auth_gate_default.png`, fullPage: true });
    const gateVisible = await page.evaluate(() => !document.getElementById('auth-gate').hidden);
    console.log(scheme, 'auth-gate visible por defecto (sin sesion):', gateVisible);
    const errorShown = await page.evaluate(() => {
      const el = document.getElementById('auth-error');
      return el && !el.hidden ? el.textContent : null;
    });
    console.log(scheme, 'mensaje de error mostrado (sb bloqueado en este sandbox):', errorShown);

    // cambiar a "Crear cuenta"
    await page.click('[data-auth-tab="signup"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `shot41_${scheme}_01_signup_tab.png`, fullPage: true });
    const submitLabel = await page.evaluate(() => document.getElementById('auth-submit-btn').textContent);
    console.log(scheme, 'label del boton en modo signup:', submitLabel);

    // intentar submit sin llenar nada -> debe mostrar error de validacion, no crashear
    await page.click('[data-auth-tab="login"]');
    await page.waitForTimeout(100);
    await page.click('#auth-submit-btn');
    await page.waitForTimeout(150);
    const validationError = await page.evaluate(() => document.getElementById('auth-error').textContent);
    console.log(scheme, 'error de validacion con campos vacios:', validationError);

    console.log(scheme, 'ERRORS:', JSON.stringify(errors));
    await context.close();
  }
  await browser.close();
})();
