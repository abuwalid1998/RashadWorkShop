'use strict';

const DEFAULTS = { host: 'localhost', port: 3306, user: 'root', password: '', database: 'carworkshop' };

/** Turn the driver's error codes into something a shop owner can act on. */
function explain(error, config) {
  const where = `${config.host}:${config.port}`;
  switch (error.code) {
    case 'ECONNREFUSED':
      return `تعذّر الاتصال بخادم MySQL على ${where}. تأكد من تشغيل MySQL (XAMPP / WAMP).`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `عنوان الخادم "${config.host}" غير معروف.`;
    case 'ETIMEDOUT':
      return `انتهت مهلة الاتصال بخادم MySQL على ${where}.`;
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_DBACCESS_DENIED_ERROR':
      return 'اسم المستخدم أو كلمة المرور غير صحيحة.';
    case 'ER_BAD_DB_ERROR':
      return `قاعدة البيانات "${config.database}" غير موجودة على الخادم.`;
    default:
      return `خطأ من MySQL: ${error.message}`;
  }
}

/**
 * Read every base table of a MySQL database.
 *
 * @param {Partial<typeof DEFAULTS>} options
 * @returns {Promise<{ database: string, tables: Array<{ name: string,
 *   columns: Array<{ name: string, type: string, primary: boolean, autoIncrement: boolean }>,
 *   rows: unknown[][] }> }>}
 */
async function readMysql(options = {}) {
  const config = { ...DEFAULTS, ...options, port: Number(options.port) || DEFAULTS.port };
  const mysql = require('mysql2/promise');
  let connection;
  try {
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      charset: 'utf8mb4',
      dateStrings: true, // keep timestamps exactly as stored, no timezone shifts
      decimalNumbers: true,
      supportBigNumbers: true,
      connectTimeout: 10000,
    });

    const [tableRows] = await connection.query(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`, [config.database]);

    const tables = [];
    for (const { name } of tableRows) {
      const [columnRows] = await connection.query(
        `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, COLUMN_KEY AS col_key, EXTRA AS extra
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, [config.database, name]);
      const columns = columnRows.map((c) => ({
        name: c.name,
        type: c.type,
        primary: c.col_key === 'PRI',
        autoIncrement: /auto_increment/i.test(c.extra || ''),
      }));
      const [rows] = await connection.query({ sql: `SELECT * FROM \`${name.replace(/`/g, '``')}\``, rowsAsArray: true });
      tables.push({ name, columns, rows });
    }
    return { database: config.database, tables };
  } catch (error) {
    const wrapped = new Error(explain(error, config));
    wrapped.cause = error;
    throw wrapped;
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

module.exports = { readMysql, DEFAULTS };
