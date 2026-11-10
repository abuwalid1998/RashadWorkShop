#!/usr/bin/env node
'use strict';
/**
 * Copy the legacy MySQL database into the app's SQLite database.
 *
 *   npm run migrate                                  # localhost, root, no password, "carworkshop"
 *   npm run migrate -- --host 192.168.1.5 --user root --password secret --database carworkshop
 *   npm run migrate -- --dump backup.sql             # from a phpMyAdmin / mysqldump export instead
 *   npm run migrate -- --out ./workshop.db           # write somewhere else
 *
 * Every table and column is copied as-is, row counts and money totals are
 * verified, and an existing SQLite database is backed up before it is replaced.
 */
const path = require('node:path');
const { ensureSqliteRuntime } = require('./run-with-electron');

const HELP = `
Usage: npm run migrate -- [options]

MySQL connection
  --host <host>          MySQL host                     (default: localhost)
  --port <port>          MySQL port                     (default: 3306)
  --user <user>          MySQL user                     (default: root)
  --password <password>  MySQL password                 (default: empty)
  --database <name>      Database to copy               (default: carworkshop)

Other sources
  --dump <file.sql>      Read a phpMyAdmin/mysqldump export instead of a live server

Output
  --out <file.db>        SQLite file to create          (default: the app's database)
  --force                Replace an existing database that already has records
                         (a backup copy is always kept)

Data options
  --swap-filter-columns  The old entry form saved the oil-filter price in the
                         air-filter column and vice versa. Pass this to put
                         them back. Off by default: data is copied unchanged.
  --recalculate-remaining
                         The old "add payment" page subtracted each payment
                         twice from the remaining amount. Pass this to store
                         remaining = total - paid instead. Off by default.
  --no-fix-encoding      Do not repair garbled Arabic (Ø£Ø­Ù…Ø¯ -> أحمد)
  --help                 Show this help
`;

function parseArgs(argv) {
  const options = {};
  const flags = new Set(['force', 'help', 'swap-filter-columns', 'recalculate-remaining', 'no-fix-encoding']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (flags.has(name)) options[name] = true;
    else if (inline !== undefined) options[name] = inline;
    else if (i + 1 < argv.length) options[name] = argv[(i += 1)];
    else throw new Error(`Missing value for --${name}`);
  }
  return options;
}

const money = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function printReport(result) {
  console.log('\nTable                      Source rows   Copied   Verified');
  console.log('-------------------------  -----------  -------  --------');
  for (const t of result.tables) {
    console.log(
      `${t.target.padEnd(25)}  ${String(t.sourceRows).padStart(11)}  ${String(t.copiedRows).padStart(7)}  ${t.verified ? 'yes' : 'NO'}`);
    for (const [column, total] of Object.entries(t.sums)) {
      console.log(`    sum(${column}) = ${money(total)}`);
    }
  }
  if (result.repairedText) console.log(`\nRepaired ${result.repairedText} garbled Arabic text value(s).`);
  if (result.ledgerEntries) {
    console.log(`Created ${result.ledgerEntries} opening payment entr${result.ledgerEntries === 1 ? 'y' : 'ies'} so account statements add up.`);
  }
  if (result.recalculated) {
    console.log(`Recalculated the remaining amount of ${result.recalculated} record(s) as total - paid.`);
  }
  if (result.inconsistentRecords) {
    console.log(
      `\nNote: ${result.inconsistentRecords} record(s) have a stored remaining amount that is not total - paid\n`
      + `(difference ${money(result.inconsistentAmount)}; a known bug of the old "add payment" page).\n`
      + 'They were copied unchanged. To correct them, re-run with --recalculate-remaining\n'
      + 'or use Settings > Data check inside the app.');
  }
  if (result.backup) console.log(`Previous database backed up to:\n  ${result.backup}`);
  console.log(`\nDone. SQLite database ready at:\n  ${result.file}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  const { databaseFile } = require('../src/main/paths');
  const { migrateFromMysql, migrateFromDump, hasData } = require('../src/main/migration/migrate');

  const target = path.resolve(args.out || databaseFile());
  if (hasData(target) && !args.force) {
    throw new Error(
      `${target}\nalready contains workshop records. Re-run with --force to replace it (a backup is kept).`);
  }

  const options = {
    fixEncoding: !args['no-fix-encoding'],
    swapFilterColumns: Boolean(args['swap-filter-columns']),
    recalculateRemaining: Boolean(args['recalculate-remaining']),
  };

  let result;
  if (args.dump) {
    console.log(`Reading dump file ${path.resolve(args.dump)} ...`);
    result = migrateFromDump(path.resolve(args.dump), target, options);
  } else {
    const connection = {
      host: args.host || 'localhost',
      port: Number(args.port) || 3306,
      user: args.user || 'root',
      password: args.password ?? '',
      database: args.database || 'carworkshop',
    };
    console.log(`Connecting to MySQL ${connection.user}@${connection.host}:${connection.port}/${connection.database} ...`);
    result = await migrateFromMysql(connection, target, options);
  }
  printReport(result);
}

if (ensureSqliteRuntime(__filename, process.argv.slice(2))) {
  main().catch((error) => {
    console.error(`\nMigration failed: ${error.message}`);
    if (error.cause) console.error(`(${error.cause.code || ''} ${error.cause.message})`.replace('( ', '('));
    console.error('');
    process.exit(1);
  });
}
