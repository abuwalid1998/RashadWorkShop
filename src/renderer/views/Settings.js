import { html, useState } from '../lib/preact.js';
import { call } from '../lib/api.js';
import { useQuery } from '../lib/hooks.js';
import { getState, setState, invalidate, toast, toastError } from '../lib/store.js';
import * as fmt from '../lib/format.js';
import { Icon } from '../lib/icons.js';
import { View, Button, TextInput, Banner, Money, useForm } from '../components/ui.js';
import { openConfirm } from '../components/overlays.js';

const fileSize = (bytes) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function ShopSection() {
  const form = useForm(getState().settings);
  const save = () => form.submit(async (values) => {
    const settings = await call('settings.update', values);
    setState({ settings });
    invalidate();
    toast('تم حفظ بيانات الورشة');
  });
  return html`<section class="card settings-card">
    <h2>بيانات الورشة</h2>
    <p class="muted">تظهر في ترويسة كشوف الحساب والمخالصات.</p>
    <div class="form-grid">
      <${TextInput} form=${form} name="shop_name" label="اسم الورشة" />
      <${TextInput} form=${form} name="shop_tagline" label="الوصف" />
      <${TextInput} form=${form} name="shop_phone" label="الهاتف" numeric />
      <${TextInput} form=${form} name="shop_address" label="العنوان" />
      <${TextInput} form=${form} name="currency" label="رمز العملة" />
    </div>
    <div class="settings-actions"><${Button} variant="primary" disabled=${form.busy} onClick=${save}>حفظ<//></div>
  </section>`;
}

function DataSection({ info }) {
  const backup = async () => {
    try {
      const result = await call('maintenance.backup');
      if (result.saved) toast('تم حفظ النسخة الاحتياطية', { action: { label: 'إظهار', run: () => call('system.showInFolder', { file: result.file }) } });
    } catch (error) {
      toastError(error);
    }
  };
  const restore = () => openConfirm({
    title: 'استعادة نسخة احتياطية؟',
    message: 'ستُستبدل البيانات الحالية بمحتوى النسخة التي تختارها. تُحفظ نسخة من البيانات الحالية تلقائياً قبل الاستبدال.',
    confirmLabel: 'اختيار ملف',
    onConfirm: async () => {
      try {
        const result = await call('maintenance.restore');
        if (!result.restored) return;
        const boot = await call('app.bootstrap');
        setState({ settings: boot.settings });
        invalidate();
        toast('تمت استعادة النسخة الاحتياطية');
      } catch (error) {
        toastError(error);
      }
    },
  });

  return html`<section class="card settings-card">
    <h2>البيانات والنسخ الاحتياطي</h2>
    <p class="muted">كل البيانات محفوظة في ملف واحد على هذا الجهاز.</p>
    <dl class="facts">
      <div><dt>الطلبات</dt><dd class="num">${fmt.number(info.orders)}</dd></div>
      <div><dt>البطاريات</dt><dd class="num">${fmt.number(info.batteries)}</dd></div>
      <div><dt>سندات الدفع</dt><dd class="num">${fmt.number(info.receipts)}</dd></div>
      <div><dt>التسويات</dt><dd class="num">${fmt.number(info.settlements)}</dd></div>
      <div><dt>حجم الملف</dt><dd class="num">${fileSize(info.size)}</dd></div>
      <div><dt>آخر نسخة يومية</dt><dd class="num">${info.lastBackupAt ? `${fmt.date(info.lastBackupAt)} ${fmt.time(info.lastBackupAt)}` : '—'}</dd></div>
    </dl>
    <div class="path-row">
      <${Icon} name="database" size="16" />
      <code class="selectable">${info.file}</code>
      <${Button} size="small" onClick=${() => call('system.showInFolder', { file: info.file })}>إظهار<//>
    </div>
    <div class="settings-actions">
      <${Button} icon="download" onClick=${backup}>حفظ نسخة احتياطية…<//>
      <${Button} icon="upload" onClick=${restore}>استعادة نسخة…<//>
    </div>
  </section>`;
}

function ScheduleSection({ info }) {
  const chooseFolder = async () => {
    try {
      const result = await call('maintenance.chooseBackupFolder');
      if (!result.changed) return;
      invalidate();
      toast('تم تغيير مجلد النسخ الاحتياطية');
    } catch (error) {
      toastError(error);
    }
  };
  const toggle = async (enabled) => {
    await call('maintenance.setBackupEnabled', { enabled }).catch(toastError);
    invalidate();
  };
  return html`<section class="card settings-card">
    <h2>النسخ الاحتياطي اليومي</h2>
    <p class="muted">كل يوم الساعة <span class="num">8:00</span> مساءً تُحفظ نسخة كاملة من البيانات في المجلد الذي تختاره، ويُحتفظ بآخر <span class="num">14</span> نسخة. إن كان البرنامج مغلقاً في ذلك الوقت، تُؤخذ النسخة عند تشغيله التالي.</p>
    ${info.lastBackupError && html`<${Banner} kind="error">تعذّر حفظ النسخة اليومية في المجلد المحدد — تأكد أنه موجود وقابل للكتابة (مثلاً أن القرص الخارجي موصول).<//>`}
    <label class="check">
      <input type="checkbox" checked=${info.backupEnabled} onChange=${(e) => toggle(e.target.checked)} />
      <span>تفعيل النسخ الاحتياطي اليومي</span>
    </label>
    <div class="path-row" style=${{ marginTop: '12px' }}>
      <${Icon} name="folder" size="16" />
      <code class="selectable">${info.backupFolder}</code>
      <${Button} size="small" onClick=${() => call('maintenance.openBackups')}>فتح<//>
    </div>
    <div class="settings-actions">
      <${Button} icon="folder" onClick=${chooseFolder}>اختيار مجلد…<//>
    </div>
  </section>`;
}

function HealthSection({ info }) {
  if (!info.inconsistentRecords) return null;
  const fix = () => openConfirm({
    title: 'تصحيح المبالغ المتبقية؟',
    message: `سيُعاد احتساب المتبقي في ${fmt.records(info.inconsistentRecords)} ليصبح: الإجمالي − المدفوع. خذ نسخة احتياطية أولاً إن أردت الرجوع.`,
    confirmLabel: 'تصحيح',
    onConfirm: async () => {
      try {
        const { corrected } = await call('maintenance.fixRemaining');
        invalidate();
        toast(`تم تصحيح ${fmt.records(corrected)}`);
      } catch (error) {
        toastError(error);
      }
    },
  });
  return html`<section class="card settings-card">
    <h2>فحص البيانات</h2>
    <${Banner} kind="warn">
      يوجد <strong>${fmt.records(info.inconsistentRecords)}</strong> فيها المبلغ المتبقي المخزَّن لا يساوي «الإجمالي − المدفوع»
      (الفرق <strong><${Money} value=${Math.abs(info.inconsistentAmount)} /></strong>).
      هذا ناتج عن خطأ معروف في صفحة «إضافة الدفع» في النظام السابق، التي كانت تطرح الدفعة مرتين.
      البيانات منقولة كما هي، والفرق يظهر في كشف الحساب كبند «تسوية رصيد مرحّل».
    <//>
    <div class="settings-actions"><${Button} onClick=${fix}>إعادة احتساب المتبقي<//></div>
  </section>`;
}

function ImportReport({ result }) {
  return html`<${Banner} kind="good">
    <strong>تم الاستيراد والتحقق.</strong>
    <ul class="import-report">
      ${result.tables.map((t) => html`<li key=${t.target}><span class="num">${fmt.number(t.copiedRows)}</span> سجل من جدول <code dir="ltr">${t.target}</code></li>`)}
      ${result.repairedText > 0 && html`<li>أُصلح ترميز <span class="num">${result.repairedText}</span> نص عربي.</li>`}
      ${result.backup && html`<li>حُفظت البيانات السابقة في مجلد النسخ الاحتياطية.</li>`}
    </ul>
  <//>`;
}

function ImportSection({ hasData }) {
  const form = useForm({
    host: 'localhost', port: '3306', user: 'root', password: '', database: 'carworkshop',
    swapFilterColumns: false, recalculateRemaining: false,
  });
  const [result, setResult] = useState(null);

  const finish = async (data) => {
    setResult(data);
    const boot = await call('app.bootstrap');
    setState({ settings: boot.settings });
    invalidate();
    toast('تم استيراد البيانات');
  };

  const run = (method) => {
    const start = () => form.submit(async (values) => {
      setResult(null);
      const data = await call(method, values);
      if (data.imported === false) return;
      await finish(data);
    });
    if (!hasData) return start();
    return openConfirm({
      title: 'استبدال البيانات الحالية؟',
      message: 'الاستيراد يستبدل كل البيانات الموجودة في التطبيق ببيانات النظام السابق. تُحفظ نسخة احتياطية من البيانات الحالية تلقائياً.',
      confirmLabel: 'استيراد واستبدال',
      onConfirm: start,
    });
  };

  const toggle = (name, label, description) => html`<label class="check">
    <input type="checkbox" checked=${form.values[name]} onChange=${(e) => form.set(name, e.target.checked)} />
    <span>${label}<small>${description}</small></span>
  </label>`;

  return html`<section class="card settings-card">
    <h2>الاستيراد من النظام السابق (MySQL)</h2>
    <p class="muted">ينقل جميع الجداول والأعمدة كما هي، ويتحقق من عدد السجلات ومجاميع المبالغ. يكفي تنفيذه مرة واحدة.</p>
    ${form.message && html`<${Banner} kind="error">${form.message}<//>`}
    ${result && html`<${ImportReport} result=${result} />`}
    <div class="form-grid three">
      <${TextInput} form=${form} name="host" label="الخادم" numeric />
      <${TextInput} form=${form} name="port" label="المنفذ" numeric />
      <${TextInput} form=${form} name="database" label="قاعدة البيانات" numeric />
      <${TextInput} form=${form} name="user" label="اسم المستخدم" numeric />
      <${TextInput} form=${form} name="password" label="كلمة المرور" type="password" placeholder="تُترك فارغة مع XAMPP" />
    </div>
    <div class="import-options">
      ${toggle('recalculateRemaining', 'إعادة احتساب المبلغ المتبقي', 'النظام السابق كان يطرح كل دفعة لاحقة مرتين. فعّل الخيار ليُحفظ المتبقي = الإجمالي − المدفوع.')}
      ${toggle('swapFilterColumns', 'تصحيح تبديل «فلتر الزيت» و«فلتر الهواء»', 'نموذج الإدخال السابق كان يحفظ سعر كل منهما في خانة الآخر.')}
    </div>
    <div class="settings-actions">
      <${Button} variant="primary" icon="database" disabled=${form.busy} onClick=${() => run('migration.mysql')}>
        ${form.busy ? 'جارٍ الاستيراد…' : 'استيراد من خادم MySQL'}<//>
      <${Button} icon="doc" disabled=${form.busy} onClick=${() => run('migration.dump')}>استيراد من ملف SQL…<//>
    </div>
  </section>`;
}

export function Settings() {
  const { data: info } = useQuery('maintenance.info');
  const version = getState().version;
  return html`<${View} title="الإعدادات">
    <div class="settings">
      <${ShopSection} />
      ${info && html`<${DataSection} info=${info} />`}
      ${info && html`<${ScheduleSection} info=${info} />`}
      ${info && html`<${HealthSection} info=${info} />`}
      ${info && html`<${ImportSection} hasData=${info.orders + info.batteries > 0} />`}
      <p class="about faint">ورشة رشاد · الإصدار <span class="num">${version}</span> · يعمل بدون خادم أو اتصال بالإنترنت
        <br />تطوير <span lang="en" dir="ltr">Amjad Khaliliah</span></p>
    </div>
  <//>`;
}
