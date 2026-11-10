'use strict';
/**
 * The fixed list of services a workshop order can contain.
 * `column` is the price column in the legacy `car_service_fixed` table.
 * Order matches the legacy entry form.
 */
const SERVICE_ITEMS = Object.freeze([
  { key: 'oil', column: 'oil_price', label: 'زيت المحرك' },
  { key: 'oil_filter', column: 'oil_filter_price', label: 'فلتر زيت' },
  { key: 'air_filter', column: 'air_filter_price', label: 'فلتر هواء' },
  { key: 'diesel_filter', column: 'diesel_filter_price', label: 'فلتر ديزل' },
  { key: 'ac_filter', column: 'ac_filter_price', label: 'فلتر مكيف' },
  { key: 'sparks', column: 'sparks_change_price', label: 'تغيير بوجيات' },
  { key: 'timing_belt', column: 'timing_belt_price', label: 'حزام تايمنج' },
]);

const PRICE_COLUMNS = SERVICE_ITEMS.map((item) => item.column);

/** Itemised lines of an order row: only services that were actually charged. */
function orderLines(row) {
  const lines = [];
  for (const item of SERVICE_ITEMS) {
    const price = Number(row[item.column]) || 0;
    if (price === 0) continue;
    const label = item.key === 'oil' && row.oil_type ? `${item.label} (${row.oil_type})` : item.label;
    lines.push({ key: item.key, label, price });
  }
  return lines;
}

module.exports = { SERVICE_ITEMS, PRICE_COLUMNS, orderLines };
