'use strict';
/**
 * Make sure a script runs on a Node.js that has SQLite built in.
 *
 * The app's SQLite driver (`node:sqlite`) needs Node 22.13+. Electron always
 * ships a new enough Node, so when the system Node is older the script is
 * re-launched on Electron's — no extra installs either way.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

/** `node:sqlite` is stable enough for us; keep its notice out of script output. */
function quietSqliteWarning() {
  const emit = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    if (String(warning?.message ?? warning).includes('SQLite')) return;
    emit.call(process, warning, ...rest);
  };
}

function hasBuiltInSqlite() {
  quietSqliteWarning();
  try {
    require('node:sqlite');
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {boolean} true when the current process can continue. Otherwise
 * the script has been re-run on Electron's Node and this process exits.
 */
function ensureSqliteRuntime(script, args) {
  if (hasBuiltInSqlite()) return true;
  let electron;
  try {
    electron = require('electron'); // under plain Node this is the binary's path
  } catch {
    console.error('Node.js 22.13+ is required, or run "npm install" first to use Electron\'s Node.');
    process.exit(1);
  }
  const result = spawnSync(electron, [script, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  process.exit(result.status ?? 1);
}

module.exports = { ensureSqliteRuntime, quietSqliteWarning };

if (require.main === module) {
  const [script, ...args] = process.argv.slice(2);
  if (!script) {
    console.error('usage: node scripts/run-with-electron.js <script> [args]');
    process.exit(1);
  }
  const file = path.resolve(script);
  if (ensureSqliteRuntime(file, args)) {
    process.argv = [process.argv[0], file, ...args];
    require(file);
  }
}
