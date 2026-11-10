'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { app, dialog, ipcMain, shell, BrowserWindow } = require('electron');
const { AppError } = require('./core/errors');
const { SERVICE_ITEMS } = require('./core/catalog');
const { today } = require('./core/dates');
const { buildDocument } = require('./documents');
const { renderPdf, printDocument } = require('./documents/pdf');
const { publishDocument } = require('./protocol');
const { migrateFromMysql, migrateFromDump, timestamp } = require('./migration/migrate');

const pick = (source, keys) => Object.fromEntries(keys.map((k) => [k, source?.[k]]));

const importOptions = (input) => ({
  swapFilterColumns: Boolean(input?.swapFilterColumns),
  recalculateRemaining: Boolean(input?.recalculateRemaining),
});

/**
 * Every operation the UI may ask for. This table is the whole surface
 * exposed to the renderer; anything not listed here cannot be called.
 *
 * @param {import('./context').AppContext} context
 */
function createHandlers(context) {
  const services = () => context.services;
  const parent = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

  return {
    'app.bootstrap': () => ({
      settings: services().settings.get(),
      catalog: SERVICE_ITEMS,
      platform: process.platform,
      version: app.getVersion(),
      today: today(),
    }),

    'dashboard.get': () => services().dashboard.get(),

    'orders.list': (params) => services().orders.list(params),
    'orders.get': ({ id }) => services().orders.get(id),
    'orders.create': (input) => services().orders.create(input),
    'orders.update': ({ id, ...input }) => services().orders.update(id, input),
    'orders.remove': ({ id }) => services().orders.remove(id),
    'orders.lastForVehicle': ({ vehicle }) => services().orders.lastForVehicle(vehicle),

    'batteries.list': (params) => services().batteries.list(params),
    'batteries.get': ({ id }) => services().batteries.get(id),
    'batteries.create': (input) => services().batteries.create(input),
    'batteries.update': ({ id, ...input }) => services().batteries.update(id, input),
    'batteries.remove': ({ id }) => services().batteries.remove(id),

    'accounts.list': (params) => services().accounts.list(params),
    'accounts.get': ({ key, ...options }) => services().accounts.get(key, options),
    'accounts.suggest': (params) => services().accounts.suggest(params),

    'payments.list': (params) => services().payments.list(params),
    'payments.create': (input) => services().payments.create(input),
    'payments.removeReceipt': ({ receiptNo }) => services().payments.removeReceipt(receiptNo),
    'payments.preview': (input) => services().payments.preview(input),

    'trash.restore': ({ trashId }) => services().trash.restore(trashId),

    'settings.update': (input) => services().settings.update(input),

    /** One query for the quick-search palette. */
    'search.global': ({ query }) => ({
      accounts: services().accounts.list({ query, limit: 5 }).rows,
      orders: services().orders.list({ query, limit: 5 }).rows,
      batteries: services().batteries.list({ query, limit: 3 }).rows,
    }),

    'documents.preview': (request) => {
      const { html, fileName } = buildDocument(services(), request);
      return { url: publishDocument(html), fileName };
    },

    'documents.savePdf': async (request) => {
      const { html, fileName } = buildDocument(services(), request);
      const { canceled, filePath } = await dialog.showSaveDialog(parent(), {
        title: 'حفظ ملف PDF',
        defaultPath: path.join(app.getPath('documents'), fileName),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { saved: false };
      await fs.promises.writeFile(filePath, await renderPdf(publishDocument(html)));
      return { saved: true, file: filePath };
    },

    'documents.print': (request) => printDocument(publishDocument(buildDocument(services(), request).html)),

    'system.openPath': async ({ file }) => ({ error: await shell.openPath(String(file)) }),
    'system.showInFolder': ({ file }) => shell.showItemInFolder(String(file)),

    'maintenance.info': () => services().maintenance.info(),
    'maintenance.fixRemaining': () => services().maintenance.fixRemaining(),
    'maintenance.openBackups': async () => {
      const folder = services().maintenance.backupFolder();
      fs.mkdirSync(folder, { recursive: true });
      return { error: await shell.openPath(folder) };
    },
    'maintenance.setBackupEnabled': ({ enabled }) => services().maintenance.setBackupEnabled(Boolean(enabled)),
    'maintenance.chooseBackupFolder': async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(parent(), {
        title: 'اختر مجلد النسخ الاحتياطية اليومية',
        defaultPath: services().maintenance.backupFolder(),
        properties: ['openDirectory', 'createDirectory'],
      });
      if (canceled || !filePaths.length) return { changed: false };
      try {
        services().maintenance.setBackupFolder(filePaths[0]);
      } catch {
        throw new AppError('تعذّرت الكتابة في هذا المجلد. اختر مجلداً آخر.', { code: 'bad_folder' });
      }
      return { changed: true, folder: filePaths[0] };
    },

    'maintenance.backup': async () => {
      const { canceled, filePath } = await dialog.showSaveDialog(parent(), {
        title: 'حفظ نسخة احتياطية',
        defaultPath: path.join(app.getPath('documents'), `workshop-backup-${timestamp()}.db`),
        filters: [{ name: 'SQLite', extensions: ['db'] }],
      });
      if (canceled || !filePath) return { saved: false };
      return { saved: true, file: services().maintenance.backupTo(filePath) };
    },

    'maintenance.restore': async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(parent(), {
        title: 'استعادة نسخة احتياطية',
        properties: ['openFile'],
        filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }],
      });
      if (canceled || !filePaths.length) return { restored: false };
      await context.restoreFrom(filePaths[0]);
      return { restored: true };
    },

    'migration.mysql': (input) =>
      context.swapDatabase((target) => migrateFromMysql(
        pick(input, ['host', 'port', 'user', 'password', 'database']),
        target, { ...importOptions(input), backupDir: context.backupsDir })),

    'migration.dump': async (input) => {
      const { canceled, filePaths } = await dialog.showOpenDialog(parent(), {
        title: 'اختر ملف التصدير من MySQL',
        properties: ['openFile'],
        filters: [{ name: 'SQL', extensions: ['sql'] }],
      });
      if (canceled || !filePaths.length) return { imported: false };
      const result = await context.swapDatabase((target) =>
        migrateFromDump(filePaths[0], target, { ...importOptions(input), backupDir: context.backupsDir }));
      return { imported: true, ...result };
    },
  };
}

/**
 * Route `api` calls to handlers. Expected failures (AppError) travel back as
 * data so the UI can show them inline; anything else is logged and reported
 * generically.
 */
function registerIpc(context) {
  const handlers = createHandlers(context);

  ipcMain.handle('api', async (event, method, payload) => {
    if (!event.senderFrame?.url?.startsWith('app://app/')) {
      return { ok: false, error: { message: 'طلب غير مصرّح به', code: 'forbidden', fields: {} } };
    }
    const handler = Object.hasOwn(handlers, method) ? handlers[method] : null;
    if (!handler) return { ok: false, error: { message: `عملية غير معروفة: ${method}`, code: 'unknown', fields: {} } };
    try {
      return { ok: true, data: await handler(payload ?? {}) };
    } catch (error) {
      if (error instanceof AppError) {
        return { ok: false, error: { message: error.message, code: error.code, fields: error.fields } };
      }
      console.error(`[api] ${method} failed:`, error);
      return { ok: false, error: { message: error?.message || 'حدث خطأ غير متوقع', code: 'internal', fields: {} } };
    }
  });
}

module.exports = { registerIpc, createHandlers };
