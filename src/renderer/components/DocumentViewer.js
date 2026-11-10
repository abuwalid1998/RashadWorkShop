import { html, useEffect, useState } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { toast, toastError } from '../lib/store.js';
import { Sheet } from './Sheet.js';
import { Button } from './ui.js';

/**
 * Preview of a printable document (account statement or settlement) with
 * Save-as-PDF and Print. The preview is the same HTML the PDF is made from.
 */
export function DocumentViewer({ request: initial, vehicles = [], onClose }) {
  const [request, setRequest] = useState(initial);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const isStatement = request.type === 'statement';

  useEffect(() => {
    let current = true;
    call('documents.preview', request).then((result) => current && setUrl(result.url), toastError);
    return () => {
      current = false;
    };
  }, [JSON.stringify(request)]);

  const savePdf = async () => {
    setBusy(true);
    try {
      const result = await call('documents.savePdf', request);
      if (result.saved) {
        toast('تم حفظ ملف PDF', { action: { label: 'فتح', run: () => call('system.openPath', { file: result.file }) } });
      }
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  const print = () => call('documents.print', request).catch(toastError);
  const patch = (changes) => setRequest((r) => ({ ...r, ...changes }));

  const controls = html`
    ${isStatement && vehicles.length > 1 && html`<select class="select" aria-label="السيارة" value=${request.vehicle || ''}
        onChange=${(e) => patch({ vehicle: e.target.value })}>
      <option value="">كل السيارات</option>
      ${vehicles.map((v) => html`<option key=${v} value=${v}>${v}</option>`)}
    </select>`}
    ${isStatement && html`<label class="doc-range">من
      <input class="input" type="date" value=${request.from || ''} onInput=${(e) => patch({ from: e.target.value })} /></label>
    <label class="doc-range">إلى
      <input class="input" type="date" value=${request.to || ''} onInput=${(e) => patch({ to: e.target.value })} /></label>`}
    <${Button} icon="printer" onClick=${print}>طباعة<//>
    <${Button} variant="primary" icon="download" disabled=${busy} onClick=${savePdf}>حفظ PDF<//>`;

  return html`<${Sheet} title=${isStatement ? 'كشف حساب' : 'تسوية حساب'} size="full" onClose=${onClose} headExtra=${controls}>
    <div class="doc-frame">
      ${url && html`<iframe src=${url} title="معاينة المستند" />`}
    </div>
  <//>`;
}
