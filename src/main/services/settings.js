'use strict';
const { createValidator } = require('../core/validate');

const DEFAULTS = Object.freeze({
  shop_name: 'ورشة رشاد',
  shop_tagline: 'لصيانة السيارات وتغيير الزيوت',
  shop_phone: '',
  shop_address: '',
  currency: '₪',
});

function createSettingsService(db) {
  function get() {
    const stored = Object.fromEntries(db.all('SELECT key, value FROM app_settings').map((r) => [r.key, r.value]));
    return { ...DEFAULTS, ...stored };
  }

  function getValue(key) {
    return db.get('SELECT value FROM app_settings WHERE key = ?', key)?.value ?? null;
  }

  function setValue(key, value) {
    db.run(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`, key, String(value));
  }

  function update(input) {
    const v = createValidator(input);
    const next = {
      shop_name: v.text('shop_name', { required: true, max: 80, label: 'اسم الورشة' }),
      shop_tagline: v.text('shop_tagline', { max: 120, label: 'الوصف' }),
      shop_phone: v.text('shop_phone', { max: 40, label: 'الهاتف' }),
      shop_address: v.text('shop_address', { max: 160, label: 'العنوان' }),
      currency: v.text('currency', { required: true, max: 8, label: 'العملة' }),
    };
    v.done();
    db.transaction(() => {
      for (const [key, value] of Object.entries(next)) setValue(key, value);
    });
    return get();
  }

  return { get, update, getValue, setValue };
}

module.exports = { createSettingsService, DEFAULTS };
