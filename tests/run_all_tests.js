// Master test runner for the Pitucas sin lucas Playwright test suite.
//
// Usage:  node run_all_tests.js
// Run this before every deploy / after every change to the app, from
// /tmp/finanzas-app. It discovers every shot_*.js test file plus smoke_test.js,
// audit_consistency.js and audit_historial.js, runs each as its own `node`
// process (so a crash in one file can't take down the rest), parses the
// ##SUMMARY## line each file prints via lib/test_kit.js's finish(), and prints
// a clear per-file and overall pass/fail report. Exits 0 only if every check
// in every file passed -- suitable for gating a deploy.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = __dirname;
const TIMEOUT_MS = 60000;

function discoverTestFiles() {
  const all = fs.readdirSync(DIR);
  // shot_*.js and audit_*.js by pattern (not a fixed list) -- so a new audit_ file joins
  // the suite on its own, just as DOCUMENTACION.md already states, without having to touch this runner each time.
  const shotFiles = all.filter(f => /^shot_.*\.js$/.test(f));
  const auditFiles = all.filter(f => /^audit_.*\.js$/.test(f));
  const set = new Set([...shotFiles, ...auditFiles]);
  if (fs.existsSync(path.join(DIR, 'smoke_test.js'))) set.add('smoke_test.js');
  return Array.from(set).sort();
}

function tail(str, n) {
  if (!str) return '';
  const lines = str.split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

function runFile(file) {
  const filePath = path.join(DIR, file);
  let res;
  try {
    res = spawnSync(process.execPath, [filePath], {
      cwd: DIR,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
    });
  } catch (e) {
    return { file, ok: false, total: 0, passed: 0, failed: 0, failLabels: [], reason: 'spawn threw: ' + e.message };
  }

  if (res.error) {
    return { file, ok: false, total: 0, passed: 0, failed: 0, failLabels: [], reason: 'spawn error: ' + res.error.message };
  }
  if (res.signal) {
    return { file, ok: false, total: 0, passed: 0, failed: 0, failLabels: [], reason: 'killed by signal ' + res.signal + ' (likely timeout after ' + TIMEOUT_MS + 'ms)', stdoutTail: tail(res.stdout, 15), stderrTail: tail(res.stderr, 15) };
  }

  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const summaryLine = stdout.split('\n').reverse().find(l => l.startsWith('##SUMMARY## '));

  if (!summaryLine) {
    return {
      file, ok: false, total: 0, passed: 0, failed: 0, failLabels: [],
      reason: 'no ##SUMMARY## line found (crashed before finish()?), exit code ' + res.status,
      stdoutTail: tail(stdout, 20), stderrTail: tail(stderr, 20),
    };
  }

  let summary;
  try {
    summary = JSON.parse(summaryLine.slice('##SUMMARY## '.length));
  } catch (e) {
    return {
      file, ok: false, total: 0, passed: 0, failed: 0, failLabels: [],
      reason: 'could not parse ##SUMMARY## line: ' + e.message,
      stdoutTail: tail(stdout, 20), stderrTail: tail(stderr, 20),
    };
  }

  const exitOk = res.status === 0;
  const checksOk = summary.failed === 0;
  const ok = exitOk && checksOk;

  return {
    file, ok,
    total: summary.total || 0, passed: summary.passed || 0, failed: summary.failed || 0,
    failLabels: summary.failLabels || [],
    reason: ok ? null : (!exitOk ? ('exit code ' + res.status + ' (non-zero) even though summary parsed') : null),
    stdoutTail: ok ? undefined : tail(stdout, 15),
    stderrTail: ok ? undefined : tail(stderr, 15),
  };
}

function main() {
  const files = discoverTestFiles();
  console.log('Descubiertos ' + files.length + ' archivos de test:\n  ' + files.join('\n  ') + '\n');

  const results = [];
  for (const file of files) {
    process.stdout.write('Corriendo ' + file + ' ... ');
    const r = runFile(file);
    results.push(r);
    if (r.ok) {
      console.log('OK');
      console.log('  ✓ ' + file + '  (' + r.passed + '/' + r.total + ')');
    } else {
      console.log('FAIL');
      const scoreStr = r.total ? ('(' + r.passed + '/' + r.total + ')') : '(sin resultados)';
      const firstFail = r.failLabels && r.failLabels.length ? r.failLabels[0] : (r.reason || 'fallo desconocido');
      console.log('  ✗ ' + file + '  ' + scoreStr + ' — FAILED: ' + firstFail);
      if (r.reason) console.log('    motivo: ' + r.reason);
      if (r.stdoutTail) console.log('    --- stdout (tail) ---\n' + indent(r.stdoutTail));
      if (r.stderrTail) console.log('    --- stderr (tail) ---\n' + indent(r.stderrTail));
    }
  }

  const totalFiles = results.length;
  const filesFullyPassed = results.filter(r => r.ok).length;
  const totalChecks = results.reduce((s, r) => s + (r.total || 0), 0);
  const totalChecksFailed = results.reduce((s, r) => s + (r.failed || 0), 0);
  const failedFiles = results.filter(r => !r.ok);

  console.log('\n' + '='.repeat(60));
  console.log('RESUMEN FINAL');
  console.log('='.repeat(60));
  console.log('Archivos: ' + filesFullyPassed + '/' + totalFiles + ' pasaron completos');
  console.log('Checks:   ' + (totalChecks - totalChecksFailed) + '/' + totalChecks + ' pasaron');

  if (failedFiles.length) {
    console.log('\nFallas por archivo:');
    failedFiles.forEach(r => {
      console.log('  ' + r.file + ':');
      if (r.reason && (!r.failLabels || !r.failLabels.length)) {
        console.log('    - ' + r.reason);
      }
      (r.failLabels || []).forEach(label => console.log('    - ' + label));
    });
  } else {
    console.log('\nTodo verde. ✅');
  }

  process.exit(failedFiles.length ? 1 : 0);
}

function indent(str) {
  return str.split('\n').map(l => '    ' + l).join('\n');
}

main();
