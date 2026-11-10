# ورشة رشاد — Rashad Workshop

A desktop application for a car-service workshop: service orders, customer accounts,
payments, battery warranties, account statements and settlements.

It is a rewrite of the original PHP + MySQL pages (kept in [`legacy/`](legacy/)) as an
installable Electron app. **It needs no server**: no PHP, no MySQL, no internet. All data
lives in one SQLite file on the computer, using the same tables and column names as the
old database.

## What it does

| Area | Details |
| --- | --- |
| **Welcome dashboard** | Month revenue against last month, cars today / this month, collected vs outstanding, 12-month revenue chart, collection rate, top services, biggest debts, recent orders, warranties about to expire. |
| **Orders** | Add, edit, delete (with undo). Typing a plate recalls the customer, phone and last visit. Search by name, plate, phone or order number, as you type. |
| **Accounts** | One account per customer with every visit itemised, a running-balance ledger, and per-vehicle filtering. |
| **Payments** | A payment is spread over the oldest unpaid items first; the sheet shows the split before you save. Every receipt is kept with its date and can be deleted or restored. |
| **Settlements** | Close an account for an agreed amount; the rest is recorded as a discount. Paying off a full balance also records a settlement. |
| **PDF documents** | Account statement (all time, a date range, or one vehicle) and settlement certificate, with preview, Save as PDF and Print. |
| **Battery warranties** | Sale, warranty period, calendar-accurate expiry date and days left. |
| **Data safety** | Automatic daily backup, manual backup / restore, and a database that can be copied as a single file. |

The interface is Arabic, right-to-left, and follows the system light / dark appearance.

Keyboard: `Ctrl/⌘ N` new order · `Ctrl/⌘ P` payment · `Ctrl/⌘ K` quick search · `Esc` close.

## Install

### Ready-made installers

Every push to this branch builds installers with GitHub Actions. Open the repository's
**Actions** tab, pick the latest *Build installers* run, and download from **Artifacts**:

- **Windows** — `RashadWorkshop-Setup-<version>.exe` (installer) or
  `RashadWorkshop-Portable-<version>.exe` (single file, nothing to install)
- **Linux** — `.AppImage` and `.deb`
- **macOS** — `.dmg` (built for tagged releases and manual runs)

The installers are not code-signed, so Windows SmartScreen shows a warning the first time:
choose *More info → Run anyway*.

### Build it yourself

Requires [Node.js](https://nodejs.org) 22 or newer, only on the machine that builds.

```bash
npm install
```

```bash
npm run dist:win
```

Use `dist:mac` or `dist:linux` on those systems. The result is written to `dist/`. Build
each platform on that platform (a Windows installer cannot be produced on Linux without
Wine).

To run without packaging:

```bash
npm start
```

## Move the data from MySQL

The old data is copied once, table by table and column by column, with nothing renamed.
Row counts and money totals are compared with the source before the new file is used, and
an existing database is always backed up first.

**Inside the app (easiest):** *الإعدادات → الاستيراد من النظام السابق*. Start MySQL (XAMPP),
keep the defaults (`localhost`, `root`, empty password, database `carworkshop`) and press
*استيراد من خادم MySQL*. If the server is gone but you have a phpMyAdmin or `mysqldump`
export, use *استيراد من ملف SQL*.

**From a terminal:**

```bash
npm run migrate
```

```bash
npm run migrate -- --host 192.168.1.5 --user root --password secret --database carworkshop
```

```bash
npm run migrate -- --dump backup.sql
```

By default the SQLite file is written where the app looks for it, so the next launch shows
the data. `npm run migrate -- --help` lists every option.

### Two things the old system got wrong

The migration copies these as they are and tells you about them; fixing is opt-in.

1. **Remaining amounts.** The old *add payment* page subtracted each payment twice, and
   applied it to every order of the vehicle. Affected records have a stored remaining
   amount that is not `total − paid`. They are reported after the import and in
   *الإعدادات → فحص البيانات*, where one click recalculates them
   (`--recalculate-remaining` on the command line).
2. **Oil filter / air filter.** The old entry form saved the oil-filter price in the
   air-filter column and vice versa. Pass `--swap-filter-columns` (or tick the option in
   the app) to put them back. New orders are always saved correctly.

Arabic text that was stored through a latin1 connection and reads as `Ø£Ø­Ù…Ø¯` is
repaired automatically.

## Where the data lives

| System | Folder |
| --- | --- |
| Windows | `%APPDATA%\RashadWorkshop` |
| macOS | `~/Library/Application Support/RashadWorkshop` |
| Linux | `~/.config/RashadWorkshop` |

`workshop.db` is the database; `backups/` holds the automatic daily copies (the latest 14)
and the copies taken before an import or restore. To move to another computer, save a
backup from Settings and restore it there. Set `RASHAD_DATA_DIR` to use another folder.

### Database layout

`car_service_fixed` and `battery_warranty` keep their original columns. The new features
use additional tables and never restructure those two:

| Table | Purpose |
| --- | --- |
| `payments` | One row per receipt and item: payments, settlement discounts, and "opening" entries for amounts already paid in the old system. |
| `settlements` | Each account settlement with a snapshot of the items it closed. |
| `account_items` | Search index over both legacy tables, kept in step by triggers. |
| `app_settings`, `trash` | Shop details for documents; deleted records awaiting undo. |

## Development

```bash
npm test
```

```bash
npm run seed:demo -- --out ./demo-data/workshop.db
```

```bash
RASHAD_DATA_DIR=./demo-data npm start
```

```
src/main/        Electron main process
  core/          Pure logic: money, allocation, ledger, normalisation, validation
  db/            SQLite wrapper and schema
  services/      Orders, batteries, payments, accounts, dashboard, backups
  documents/     Statement and settlement HTML, rendered to PDF by Chromium
  migration/     MySQL / SQL-dump readers and the verified importer
  ipc.js         The full list of operations the interface may call
src/renderer/    Interface (Preact + htm, no build step)
scripts/         Migration CLI, demo data, icon generator
tests/           node:test suites (run against real SQLite)
legacy/          The original PHP application, for reference
```

SQLite comes from Node's built-in `node:sqlite`, so there are no native modules to compile
and the packaged app has no external dependencies. The interface is served from a private
`app://` origin with a strict Content-Security-Policy, context isolation and a sandboxed
renderer; every database query is parameterised.

The Arabic typeface is IBM Plex Sans Arabic (SIL Open Font License, see
`src/renderer/fonts/OFL.txt`).
