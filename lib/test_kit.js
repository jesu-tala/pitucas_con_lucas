// Shared test helper for the Pitucas sin lucas Playwright test suite.
//
// Every test file is its own `node <file>.js` process (that's how run_all_tests.js
// invokes them), so the `results` array below starts empty each time -- no manual
// reset needed between files.
//
// Typical usage in a test file:
//
//   const { openApp, check, finish } = require('./lib/test_kit');
//   (async () => {
//     const { context, browser, page, errors } = await openApp();
//     ... page.click(...), page.evaluate(...) ...
//     check('descripción de lo que se prueba', someBooleanCondition, optionalExtraDetail);
//     await finish({ context, browser, errors });
//   })();

const path = require('path');
const { chromium } = require('playwright');

const APP_DIR = path.join(__dirname, '..');

const results = [];

function safeJSON(x) {
  try { return JSON.stringify(x); } catch (e) { return String(x); }
}

/**
 * Records one pass/fail check and prints it immediately.
 * @param {string} label - human-readable description of what's being checked.
 * @param {*} condition - truthy/falsy; coerced with !!.
 * @param {*} [extra] - optional extra detail, printed as JSON on failure.
 * @returns {boolean} the coerced pass/fail value.
 */
function check(label, condition, extra) {
  const pass = !!condition;
  results.push({ label, pass, extra });
  if (pass) {
    console.log('[PASS] ' + label);
  } else if (extra !== undefined) {
    console.log('[FAIL] ' + label + ' ' + safeJSON(extra));
  } else {
    console.log('[FAIL] ' + label);
  }
  return pass;
}

/**
 * Launches Chromium, opens the app (test_debug.html by default, test.html when
 * debug:false), hides the auth gate, and wires up JS-error / console-error capture.
 *
 * `hideGate` and `waitAfter` default to the standard behavior every test relies on
 * (gate hidden, 300ms settle). They only exist so shot_auth_flash.js -- which
 * specifically tests the auth-gate's own initial-render timing -- can opt out and
 * inspect the page in its true just-loaded state.
 */
async function openApp({ debug = true, viewport = { width: 420, height: 950 }, colorScheme, hideGate = true, waitAfter = 300 } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const contextOpts = { viewport };
  if (colorScheme) contextOpts.colorScheme = colorScheme;
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !/TUNNEL/i.test(msg.text())) errors.push('console: ' + msg.text());
  });

  const file = debug ? 'test_debug.html' : 'test.html';
  await page.goto('file://' + path.join(APP_DIR, file));
  if (hideGate) {
    await page.evaluate(() => { const g = document.getElementById('auth-gate'); if (g) g.hidden = true; });
  }
  if (waitAfter) {
    await page.waitForTimeout(waitAfter);
  }

  return { browser, context, page, errors };
}

/**
 * Finalizes a test file: adds the automatic "no JS/console errors" check, closes
 * the browser/context (tolerating already-closed or missing ones), prints the
 * ##SUMMARY## line for run_all_tests.js to parse, and exits with the right code.
 */
async function finish({ context, browser, errors } = {}) {
  const errs = errors || [];
  check('sin errores de JS/consola', errs.length === 0, errs.length ? errs : undefined);

  if (context) {
    try { await context.close(); } catch (e) { /* already closed, ignore */ }
  }
  if (browser) {
    try { await browser.close(); } catch (e) { /* already closed, ignore */ }
  }

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;
  const failLabels = results.filter(r => !r.pass).map(r => r.label);

  console.log('##SUMMARY## ' + JSON.stringify({ total, passed, failed, failLabels }));
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = { openApp, check, finish, APP_DIR };
