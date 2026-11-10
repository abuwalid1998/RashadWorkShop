'use strict';
/**
 * Generate the app logo from geometry: a service gear around a drop of oil.
 *
 *   npm run icons
 *
 * Writes the SVGs used inside the app and, when run by Electron, renders
 * build/icon.png (1024px) which electron-builder converts to .ico / .icns.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SIZE = 1024;
const C = SIZE / 2;

const f = (n) => Number(n.toFixed(2));
const polar = (radius, degrees) => {
  const a = (degrees - 90) * (Math.PI / 180);
  return [f(C + radius * Math.cos(a)), f(C + radius * Math.sin(a))];
};

/** Gear outline: flat-topped teeth joined by arcs on the root circle. */
function gearPath({ teeth = 8, outer = 268, root = 210, top = 10.5, base = 17 }) {
  const step = 360 / teeth;
  let d = '';
  for (let i = 0; i < teeth; i += 1) {
    const mid = i * step;
    const [x1, y1] = polar(root, mid - base);
    const [x2, y2] = polar(outer, mid - top);
    const [x3, y3] = polar(outer, mid + top);
    const [x4, y4] = polar(root, mid + base);
    const [x5, y5] = polar(root, mid + step - base);
    d += `${i === 0 ? `M${x1} ${y1}` : ''}L${x2} ${y2}A${outer} ${outer} 0 0 1 ${x3} ${y3}L${x4} ${y4}A${root} ${root} 0 0 1 ${x5} ${y5}`;
  }
  return `${d}Z`;
}

const circlePath = (r) => `M${C - r} ${C}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** Superellipse ("squircle") — continuous corners like an app icon. */
function squirclePath(size, exponent = 5) {
  const half = size / 2;
  const points = [];
  for (let i = 0; i < 180; i += 1) {
    const t = (i / 180) * 2 * Math.PI;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const x = C + half * Math.sign(cos) * Math.abs(cos) ** (2 / exponent);
    const y = C + half * Math.sign(sin) * Math.abs(sin) ** (2 / exponent);
    points.push(`${f(x)} ${f(y)}`);
  }
  return `M${points.join('L')}Z`;
}

const GEAR = `${gearPath({})}${circlePath(132)}`;
const DROP = `M${C} ${C - 96}C${C - 16} ${C - 70} ${C - 64} ${C - 14} ${C - 64} ${C + 30}a64 64 0 0 0 128 0C${C + 64} ${C - 14} ${C + 16} ${C - 70} ${C} ${C - 96}Z`;
const SHINE = `M${C - 34} ${C + 34}a34 34 0 0 0 22 30`;

/** Full-colour app icon. `inset` leaves room around the tile for OS shadows. */
function iconSvg({ inset = 64 } = {}) {
  const tile = squirclePath(SIZE - inset * 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="ورشة رشاد">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3D9BFF"/>
      <stop offset="1" stop-color="#0B4FD8"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/>
      <stop offset=".5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="oil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFD84D"/>
      <stop offset="1" stop-color="#FF9F0A"/>
    </linearGradient>
    <filter id="lift" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#062A7A" flood-opacity=".35"/>
    </filter>
  </defs>
  <path d="${tile}" fill="url(#tile)"/>
  <path d="${tile}" fill="url(#sheen)"/>
  <g filter="url(#lift)">
    <path d="${GEAR}" fill="#fff" fill-rule="evenodd" stroke="#fff" stroke-width="18" stroke-linejoin="round"/>
    <path d="${DROP}" fill="url(#oil)"/>
    <path d="${SHINE}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="12" stroke-linecap="round"/>
  </g>
</svg>
`;
}

function writeSvgs() {
  const assets = path.join(ROOT, 'src', 'renderer', 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.writeFileSync(path.join(assets, 'logo.svg'), iconSvg({ inset: 0 }));
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.svg'), iconSvg());
}

async function renderPng() {
  const { app, BrowserWindow } = require('electron');
  app.disableHardwareAcceleration();
  await app.whenReady();
  const window = new BrowserWindow({
    width: SIZE, height: SIZE, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true },
  });
  const svg = fs.readFileSync(path.join(ROOT, 'build', 'icon.svg'), 'utf8');
  const page = `<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${SIZE}" height="${SIZE}" `)}</body>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), image.resize({ width: SIZE, height: SIZE }).toPNG());
  // A smaller copy ships inside the app for the window/taskbar icon on Linux.
  fs.writeFileSync(
    path.join(ROOT, 'src', 'renderer', 'assets', 'icon.png'),
    image.resize({ width: 256, height: 256, quality: 'best' }).toPNG());
  app.quit();
}

writeSvgs();
if (process.versions.electron) {
  renderPng().then(() => console.log('Wrote logo SVGs and build/icon.png'));
} else {
  console.log('Wrote logo SVGs. Run with Electron ("npm run icons") to also render build/icon.png');
}
