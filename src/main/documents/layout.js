'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { esc, date } = require('./format');

const ASSETS = 'app://app';

let logoCache = null;
/** The logo is inlined so a document never depends on another request. */
function logoSvg() {
  if (logoCache === null) {
    try {
      logoCache = fs.readFileSync(path.join(__dirname, '..', '..', 'renderer', 'assets', 'logo.svg'), 'utf8');
    } catch {
      logoCache = '';
    }
  }
  return logoCache;
}

const fontFace = (weight) => `
  @font-face { font-family: "Plex Arabic"; font-weight: ${weight};
    src: url("${ASSETS}/fonts/plex-arabic-${weight}.woff2") format("woff2");
    unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFC, U+200C-200E; }
  @font-face { font-family: "Plex Arabic"; font-weight: ${weight};
    src: url("${ASSETS}/fonts/plex-latin-${weight}.woff2") format("woff2");
    unicode-range: U+0000-00FF, U+2000-206F, U+20AA, U+20AC, U+2212; }`;

const STYLES = `
  ${[400, 500, 600, 700].map(fontFace).join('')}
  @page { size: A4; margin: 14mm 13mm 16mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; color: #1d1d1f; background: #fff;
    font: 400 10pt/1.55 "Plex Arabic", system-ui, "Segoe UI", Tahoma, sans-serif;
  }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; unicode-bidi: isolate; }
  .muted { color: #86868b; }

  .sheet { max-width: 184mm; margin: 0 auto; }
  @media screen {
    html { background: #e8e8ed; }
    .sheet { background: #fff; margin: 20px auto; padding: 14mm 13mm; min-height: 297mm;
             width: 210mm; max-width: none; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 12px 40px rgba(0,0,0,.12); border-radius: 4px; }
  }

  header.doc-head { display: flex; align-items: center; gap: 12px; padding-bottom: 12px;
                    border-bottom: 2px solid #1d1d1f; }
  .doc-head .logo { width: 46px; height: 46px; flex: none; }
  .doc-head .logo svg { width: 100%; height: 100%; display: block; }
  .doc-head .shop { flex: 1; min-width: 0; }
  .doc-head .shop-name { font-size: 15pt; font-weight: 700; line-height: 1.25; }
  .doc-head .shop-meta { color: #6e6e73; font-size: 9pt; }
  .doc-head .title { text-align: left; }
  .doc-head .title h1 { margin: 0; font-size: 17pt; font-weight: 700; line-height: 1.2; }
  .doc-head .title div { color: #6e6e73; font-size: 9pt; }

  .party { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 16px; margin: 14px 0 12px; }
  .party .field label { display: block; color: #86868b; font-size: 8pt; font-weight: 500; }
  .party .field div { font-weight: 600; font-size: 10.5pt; overflow-wrap: anywhere; }
  .party .wide { grid-column: span 2; }

  .summary { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #d2d2d7;
             border-radius: 10px; overflow: hidden; margin-bottom: 16px; }
  .summary .cell { padding: 9px 12px; border-inline-start: 1px solid #d2d2d7; }
  .summary .cell:first-child { border-inline-start: 0; }
  .summary label { display: block; color: #6e6e73; font-size: 8pt; font-weight: 500; }
  .summary .value { font-size: 13pt; font-weight: 700; line-height: 1.35; }
  .summary .cell.total { background: #1d1d1f; color: #fff; }
  .summary .cell.total label { color: rgba(255,255,255,.72); }
  .summary .cell.clear { background: #1e7b34; }

  h2 { font-size: 11pt; font-weight: 700; margin: 16px 0 6px; break-after: avoid; }
  h2 small { font-weight: 400; color: #86868b; font-size: 8.5pt; margin-inline-start: 6px; }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead { display: table-header-group; }
  th { text-align: start; font-weight: 600; font-size: 8pt; color: #6e6e73; padding: 5px 6px;
       border-bottom: 1px solid #1d1d1f; white-space: nowrap; }
  td { padding: 6px; border-bottom: 1px solid #e5e5ea; vertical-align: top; }
  tr { break-inside: avoid; }
  th.end, td.end { text-align: end; }
  /* A row group, not a footer group: print the totals once, not on every page. */
  tfoot { display: table-row-group; }
  tfoot td { font-weight: 700; border-bottom: 0; border-top: 1px solid #1d1d1f; }
  td.strong { font-weight: 600; }
  .lines { margin: 0; padding: 0; list-style: none; }
  .lines li { display: flex; justify-content: space-between; gap: 10px; }
  .lines li span:last-child { color: #6e6e73; }
  .tag { display: inline-block; padding: 0 6px; border-radius: 4px; font-size: 7.5pt; font-weight: 600;
         background: #f2f2f7; color: #48484a; }
  .tag.due { background: #fff1e0; color: #a34700; }
  .tag.paid { background: #e3f6e8; color: #1e7b34; }
  tr.opening td { background: #f7f7fa; font-weight: 600; }

  .statement-text { margin: 14px 0; font-size: 10.5pt; line-height: 1.9; }
  .note { margin-top: 10px; padding: 8px 12px; background: #f7f7fa; border-radius: 8px; font-size: 9pt; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 44px; break-inside: avoid; }
  .signatures div { border-top: 1px solid #1d1d1f; padding-top: 5px; font-size: 9pt; color: #6e6e73; }
  footer.doc-foot { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e5e5ea; color: #86868b;
                    font-size: 8pt; display: flex; justify-content: space-between; break-inside: avoid; }
`;

/**
 * Wrap document content in the shared A4 page: letterhead, typography, footer.
 *
 * @param {{ title: string, subtitle?: string, settings: object, generatedOn: string, body: string }} options
 */
function page({ title, subtitle = '', settings, generatedOn, body }) {
  const meta = [settings.shop_tagline, settings.shop_address, settings.shop_phone].filter(Boolean);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src app:; img-src data:">
<title>${esc(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="sheet">
  <header class="doc-head">
    <div class="logo">${logoSvg()}</div>
    <div class="shop">
      <div class="shop-name">${esc(settings.shop_name)}</div>
      <div class="shop-meta">${meta.map(esc).join(' · ')}</div>
    </div>
    <div class="title">
      <h1>${esc(title)}</h1>
      <div>${subtitle}</div>
    </div>
  </header>
  ${body}
  <footer class="doc-foot">
    <span>${esc(settings.shop_name)} — شكراً لثقتكم</span>
    <span>تاريخ الإصدار ${date(generatedOn)}</span>
  </footer>
</div>
</body>
</html>`;
}

module.exports = { page };
