'use strict';
const os = require('node:os');
const path = require('node:path');

const APP_DIR_NAME = 'RashadWorkshop';
const DB_FILE_NAME = 'workshop.db';

/**
 * Where the app keeps its data. Computed without Electron so the migration
 * script (plain Node) and the app agree on the same folder.
 */
function userDataDir() {
  if (process.env.RASHAD_DATA_DIR) return path.resolve(process.env.RASHAD_DATA_DIR);
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), APP_DIR_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_DIR_NAME);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), APP_DIR_NAME);
}

const databaseFile = () => path.join(userDataDir(), DB_FILE_NAME);
const backupsDir = () => path.join(userDataDir(), 'backups');

module.exports = { APP_DIR_NAME, DB_FILE_NAME, userDataDir, databaseFile, backupsDir };
