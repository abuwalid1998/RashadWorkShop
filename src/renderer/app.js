import { html, render, useEffect, useState } from './lib/preact.js';
import { call } from './lib/api.js';
import { setState, useStore, toastError } from './lib/store.js';
import { useKey } from './lib/hooks.js';
import { Icon } from './lib/icons.js';
import { Toasts } from './components/Toasts.js';
import { Confirm } from './components/Sheet.js';
import { OrderForm } from './components/OrderForm.js';
import { BatteryForm } from './components/BatteryForm.js';
import { PaymentSheet } from './components/PaymentSheet.js';
import { DocumentViewer } from './components/DocumentViewer.js';
import { CommandPalette } from './components/CommandPalette.js';
import { closeOverlay, openOrderForm, openPayment, openPalette } from './components/overlays.js';
import { Dashboard } from './views/Dashboard.js';
import { Orders } from './views/Orders.js';
import { Accounts } from './views/Accounts.js';
import { Batteries } from './views/Batteries.js';
import { Payments } from './views/Payments.js';
import { Settings } from './views/Settings.js';

const SECTIONS = [
  { id: 'dashboard', label: 'الرئيسية', icon: 'dashboard', view: Dashboard },
  { id: 'orders', label: 'الطلبات', icon: 'wrench', view: Orders },
  { id: 'accounts', label: 'الحسابات', icon: 'people', view: Accounts },
  { id: 'batteries', label: 'البطاريات', icon: 'battery', view: Batteries },
  { id: 'payments', label: 'المدفوعات', icon: 'card', view: Payments },
];
const SETTINGS = { id: 'settings', label: 'الإعدادات', icon: 'gear', view: Settings };

const OVERLAYS = {
  order: OrderForm,
  battery: BatteryForm,
  payment: PaymentSheet,
  document: DocumentViewer,
  confirm: Confirm,
  palette: CommandPalette,
};

function Sidebar({ route, navigate, settings }) {
  const item = (section) => html`<button type="button" class="nav-item" key=${section.id}
      aria-current=${route.section === section.id ? 'page' : undefined}
      onPointerDown=${(e) => e.button === 0 && navigate(section.id)}
      onClick=${() => navigate(section.id)}>
    <${Icon} name=${section.icon} /><span>${section.label}</span>
  </button>`;
  const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
  return html`<nav class="sidebar" aria-label="أقسام التطبيق">
    <div class="brand">
      <img src="assets/logo.svg" alt="" />
      <div>
        <div class="brand-name">${settings.shop_name}</div>
        <div class="brand-sub">${settings.shop_tagline}</div>
      </div>
    </div>
    ${SECTIONS.map(item)}
    <div class="sidebar-spacer" />
    <button type="button" class="search-hint" onClick=${openPalette}>
      <${Icon} name="search" /><span>بحث سريع</span><kbd>${mod} K</kbd>
    </button>
    ${item(SETTINGS)}
  </nav>`;
}

function App() {
  const [route, setRoute] = useState({ section: 'dashboard', params: {}, serial: 0 });
  const settings = useStore((s) => s.settings);
  const overlays = useStore((s) => s.overlays || []);

  const navigate = (section, params = {}) => setRoute((r) => ({ section, params, serial: r.serial + 1 }));

  useKey('k', (e) => { e.preventDefault(); openPalette(); }, { mod: true });
  useKey('n', (e) => { e.preventDefault(); openOrderForm(); }, { mod: true });
  useKey('p', (e) => { e.preventDefault(); openPayment(); }, { mod: true });

  useEffect(() => window.workshop.onMenuAction((action) => {
    if (action === 'new-order') openOrderForm();
    else if (action === 'new-payment') openPayment();
    else if (action === 'search') openPalette();
  }), []);

  const section = [...SECTIONS, SETTINGS].find((s) => s.id === route.section) || SECTIONS[0];
  const ActiveView = section.view;

  return html`<div class="shell">
    <${Sidebar} route=${route} navigate=${navigate} settings=${settings} />
    <main class="main">
      <${ActiveView} key=${`${route.section}:${route.serial}`} navigate=${navigate} params=${route.params} />
    </main>
    ${overlays.map((overlay) => {
    const Overlay = OVERLAYS[overlay.type];
    return html`<${Overlay} key=${overlay.id} ...${overlay} navigate=${navigate} onClose=${() => closeOverlay(overlay.id)} />`;
  })}
    <${Toasts} />
  </div>`;
}

async function start() {
  const root = document.getElementById('app');
  try {
    const boot = await call('app.bootstrap');
    document.documentElement.dataset.platform = boot.platform;
    setState({ ...boot, overlays: [] });
    render(html`<${App} />`, root);
  } catch (error) {
    root.textContent = `تعذّر تشغيل التطبيق: ${error.message}`;
    toastError(error);
  }
}

start();
