// Regresión: manifest.json todavía decía "Plata Clara" (el nombre viejo de la app, de antes de
// renombrarla a "Pitucas sin lucas") -- eso significa que si alguien la instala como PWA desde
// el teléfono, el ícono en la pantalla de inicio se vería con el nombre viejo, aunque toda la
// app por dentro ya diga "Pitucas sin lucas". Este test no abre el navegador (no hace falta):
// solo lee los archivos que se suben a Cloudflare y compara nombres/rutas directamente.
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

  // index.html referencia manifest.json de forma relativa -- confirma que existe en el mismo
  // directorio (lo que se sube a Cloudflare tiene que incluirlo junto a index.html).
  check('index.html enlaza manifest.json', /<link rel="manifest" href="manifest\.json">/.test(indexHtml));

  // Cada ícono que declara el manifest debe existir de verdad en disco -- si falta uno, la PWA
  // se instala sin ícono (o con uno roto) en vez de fallar de forma visible en el navegador.
  const iconChecks = (manifest && manifest.icons || []).map(ic => ({
    src: ic.src,
    existe: fs.existsSync(path.join(APP_DIR, ic.src)),
  }));
  check('manifest.json declara al menos un ícono', iconChecks.length > 0, iconChecks);
  check('Todos los íconos declarados existen en disco', iconChecks.every(i => i.existe), iconChecks);

  await finish({});
})();
