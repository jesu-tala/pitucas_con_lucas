// Regression: manifest.json still said "Plata Clara" (the app's old name, from before
// renaming it to "Pitucas sin lucas") -- that means if someone installs it as a PWA from
// their phone, the icon on the home screen would show the old name, even though the whole
// app internally already says "Pitucas sin lucas". This test doesn't open the browser (no need to):
// it just reads the files that get uploaded to Cloudflare and compares names/paths directly.
const fs = require('fs');
const path = require('path');
const { check, finish, APP_DIR } = require('./lib/test_kit');

(async () => {
  const indexHtml = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf-8');
  const manifestRaw = fs.readFileSync(path.join(APP_DIR, 'manifest.json'), 'utf-8');
  let manifest = null;
  try { manifest = JSON.parse(manifestRaw); } catch (e) { manifest = null; }

  check('manifest.json es JSON válido', manifest !== null);

  const tituloMatch = indexHtml.match(/<title>([^<]*)<\/title>/);
  const titulo = tituloMatch ? tituloMatch[1] : null;
  check('index.html tiene un <title>', !!titulo, titulo);

  check('manifest.json "name" coincide con el <title> de la app', manifest && manifest.name === titulo, { manifestName: manifest && manifest.name, titulo });
  check('manifest.json "short_name" coincide con el <title> de la app', manifest && manifest.short_name === titulo, { manifestShortName: manifest && manifest.short_name, titulo });

  const appleTitleMatch = indexHtml.match(/apple-mobile-web-app-title"\s+content="([^"]*)"/);
  const appleTitle = appleTitleMatch ? appleTitleMatch[1] : null;
  check('manifest.json "name" coincide con apple-mobile-web-app-title', manifest && appleTitle && manifest.name === appleTitle, { manifestName: manifest && manifest.name, appleTitle });

  // index.html references manifest.json relatively -- confirm it exists in the same
  // directory (what gets uploaded to Cloudflare has to include it alongside index.html).
  check('index.html enlaza manifest.json', /<link rel="manifest" href="manifest\.json">/.test(indexHtml));

  // Every icon the manifest declares must really exist on disk -- if one is missing, the PWA
  // installs without an icon (or with a broken one) instead of failing visibly in the browser.
  const iconChecks = (manifest && manifest.icons || []).map(ic => ({
    src: ic.src,
    existe: fs.existsSync(path.join(APP_DIR, ic.src)),
  }));
  check('manifest.json declara al menos un ícono', iconChecks.length > 0, iconChecks);
  check('Todos los íconos declarados existen en disco', iconChecks.every(i => i.existe), iconChecks);

  await finish({});
})();
