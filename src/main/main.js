'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, protocol, nativeTheme, shell } = require('electron');
const { AppContext } = require('./context');
const { registerIpc } = require('./ipc');
const { handleRequest, SCHEME, APP_URL } = require('./protocol');
const { userDataDir, databaseFile, backupsDir } = require('./paths');

// node:sqlite is built into Electron's Node; silence its "experimental" notice.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  if (String(warning?.message ?? warning).includes('SQLite')) return;
  emitWarning.call(process, warning, ...rest);
};

const isMac = process.platform === 'darwin';
const STATE_FILE = () => path.join(userDataDir(), 'window-state.json');

app.setName('Rashad Workshop');
// Date fields read day/month/year with Latin digits, matching the rest of the UI.
app.commandLine.appendSwitch('lang', 'en-GB');
app.setPath('userData', userDataDir());
protocol.registerSchemesAsPrivileged([SCHEME]);

let mainWindow = null;
let context = null;

function readWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
    if (Number.isFinite(state.width) && Number.isFinite(state.height)) return state;
  } catch {
    // First launch, or an unreadable file: fall back to defaults.
  }
  return { width: 1360, height: 860 };
}

function saveWindowState(window) {
  if (window.isDestroyed() || window.isMinimized()) return;
  const state = { ...window.getNormalBounds(), maximized: window.isMaximized() };
  try {
    fs.writeFileSync(STATE_FILE(), JSON.stringify(state));
  } catch {
    // Losing the window position is harmless.
  }
}

function createWindow() {
  const state = readWindowState();
  const dark = nativeTheme.shouldUseDarkColors;
  mainWindow = new BrowserWindow({
    ...state,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'ورشة رشاد',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
    backgroundColor: dark ? '#161617' : '#f5f5f7',
    autoHideMenuBar: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (state.maximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // The window only ever shows the app itself.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://app/')) event.preventDefault();
  });

  mainWindow.loadURL(APP_URL);
}

/** Daily 8 PM backup; also catches up at launch if the app was closed then. */
function runScheduledBackup() {
  try {
    // Services are briefly absent while a restore/import swaps the database.
    const file = context?.services?.maintenance.scheduledBackup();
    if (file) mainWindow?.webContents.send('menu-action', 'backup-done');
  } catch (error) {
    console.error('Scheduled backup failed:', error);
  }
}

const send = (action) => () => mainWindow?.webContents.send('menu-action', action);

function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'ملف',
      submenu: [
        { label: 'طلب جديد', accelerator: 'CmdOrCtrl+N', click: send('new-order') },
        { label: 'تسديد دفعة', accelerator: 'CmdOrCtrl+P', click: send('new-payment') },
        { label: 'بحث سريع', accelerator: 'CmdOrCtrl+K', click: send('search') },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'إغلاق' } : { role: 'quit', label: 'خروج' },
      ],
    },
    { role: 'editMenu', label: 'تحرير' },
    {
      label: 'عرض',
      submenu: [
        { role: 'reload', label: 'إعادة تحميل' },
        { role: 'togglefullscreen', label: 'ملء الشاشة' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'الحجم الأصلي' },
        { role: 'zoomIn', label: 'تكبير' },
        { role: 'zoomOut', label: 'تصغير' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  // Two instances writing one database file is how data gets lost.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    protocol.handle('app', handleRequest);
    context = new AppContext({ file: databaseFile(), backupsDir: backupsDir() }).open();
    runScheduledBackup();
    setInterval(runScheduledBackup, 60 * 1000);
    registerIpc(context);
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });

  app.on('will-quit', () => {
    context?.close();
  });
}
