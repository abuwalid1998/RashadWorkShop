import { html, useEffect, useLayoutEffect, useRef, useState } from '../lib/preact.js';
import * as fmt from '../lib/format.js';

/** Width of an element, tracked as it resizes, so SVG text stays crisp. */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    setWidth(Math.round(element.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Round an axis maximum up to 1/2/5 × 10ⁿ steps so ticks are clean numbers. */
function niceScale(max, ticks = 4) {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough);
  return { top: Math.ceil(max / step) * step, step };
}

/** Column with square baseline and a 4px rounded data-end. */
function columnPath(x, y, width, height, round) {
  const r = Math.min(round, width / 2, height);
  return `M${x} ${y + height}V${y + r}a${r} ${r} 0 0 1 ${r}-${r}h${width - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${y + height}Z`;
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return html`<div class="tip" style=${{ left: `${tip.x}px`, top: `${tip.y}px`, transform: 'translate(-50%, calc(-100% - 10px))' }}>
    <div class="tip-title">${tip.title}</div>
    ${tip.rows.map((row) => html`<div class="tip-row" key=${row.label}>
      ${row.color && html`<i style=${{ background: row.color }} />`}
      <span>${row.label}</span><strong class="num">${row.value}</strong>
    </div>`)}
  </div>`;
}

/**
 * Monthly revenue as stacked columns: what was collected (solid) and what is
 * still owed (lighter step of the same hue) from each month's invoices.
 * Time runs right-to-left, matching the reading direction of the UI.
 *
 * @param {{ data: Array<{ month: string, orders: number, billed: number, paid: number, remaining: number }> }} props
 */
export function MonthlyChart({ data }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(-1);
  const [tip, setTip] = useState(null);

  const height = 300;
  const margin = { top: 22, right: 46, bottom: 26, left: 6 };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const band = plotW / data.length;
  const barW = Math.max(6, Math.min(24, band * 0.46));
  const stackTop = Math.max(...data.map((d) => d.paid + d.remaining), 0);
  const { top, step } = niceScale(stackTop);
  const y = (value) => margin.top + plotH - (value / top) * plotH;
  const baseline = margin.top + plotH;
  const ticks = [];
  for (let value = 0; value <= top + 1e-9; value += step) ticks.push(value);
  // One number style per axis: compact everywhere once the axis reaches 10K.
  const tickLabel = (value) => (top >= 10000
    ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    : fmt.number(value));

  const show = (index, element) => {
    const d = data[index];
    const box = element.getBoundingClientRect();
    setActive(index);
    setTip({
      x: box.left + box.width / 2,
      y: box.top + (y(d.paid + d.remaining) - margin.top),
      title: fmt.monthLong(d.month),
      rows: [
        { label: 'محصّل', value: fmt.money(d.paid), color: 'var(--series)' },
        { label: 'متبقٍ', value: fmt.money(d.remaining), color: 'var(--series-light)' },
        { label: 'عدد الطلبات', value: fmt.number(d.orders) },
      ],
    });
  };
  const hide = () => {
    setActive(-1);
    setTip(null);
  };

  const last = data.length - 1;

  return html`<div class="chart" ref=${ref}>
    ${width > 0 && html`<svg width=${width} height=${height} direction="ltr" role="group" aria-label="الإيراد الشهري لآخر 12 شهراً">
      ${ticks.map((value) => html`<g key=${value}>
        <line x1=${margin.left} x2=${margin.left + plotW} y1=${y(value)} y2=${y(value)}
          stroke=${value === 0 ? 'var(--axis)' : 'var(--grid)'} stroke-width="1" />
        <text x=${width - margin.right + 8} y=${y(value) + 4} class="axis-label" text-anchor="start">${tickLabel(value)}</text>
      </g>`)}
      ${data.map((d, index) => {
    const center = margin.left + plotW - (index + 0.5) * band;
    const x = center - barW / 2;
    const paidH = (d.paid / top) * plotH;
    const remainingH = (d.remaining / top) * plotH;
    const gap = paidH > 0 && remainingH > 0 ? 2 : 0;
    const dimmed = active !== -1 && active !== index;
    return html`<g key=${d.month} opacity=${dimmed ? 0.45 : 1} style=${{ transition: 'opacity 120ms' }}>
          ${paidH > 0 && html`<path d=${columnPath(x, baseline - paidH, barW, paidH, remainingH > 0 ? 0 : 4)} fill="var(--series)" />`}
          ${remainingH > 0 && html`<path d=${columnPath(x, baseline - paidH - gap - remainingH, barW, remainingH, 4)} fill="var(--series-light)" />`}
          ${index === last && d.paid + d.remaining > 0 && html`<text x=${center} y=${y(d.paid + d.remaining) - 7}
            class="value-label" text-anchor="middle">${fmt.compact(d.paid + d.remaining)}</text>`}
          <text x=${center} y=${height - 7} class="axis-label" text-anchor="middle">${fmt.monthShort(d.month)}</text>
          <rect x=${center - band / 2} y=${margin.top} width=${band} height=${plotH} fill="transparent" tabindex="0"
            role="img" aria-label=${`${fmt.monthLong(d.month)}: محصّل ${fmt.money(d.paid)}، متبقٍ ${fmt.money(d.remaining)}، ${d.orders} طلب`}
            onPointerEnter=${(e) => show(index, e.currentTarget)} onPointerLeave=${hide}
            onFocus=${(e) => show(index, e.currentTarget)} onBlur=${hide} />
        </g>`;
  })}
    </svg>`}
    <${Tooltip} tip=${tip} />
  </div>`;
}

export function MonthlyTable({ data }) {
  return html`<div class="table-wrap"><table class="data compact">
    <thead><tr><th>الشهر</th><th class="end">الطلبات</th><th class="end">الإيراد</th><th class="end">محصّل</th><th class="end">متبقٍ</th></tr></thead>
    <tbody>${[...data].reverse().map((d) => html`<tr key=${d.month}>
      <td>${fmt.monthLong(d.month)}</td>
      <td class="end num">${fmt.number(d.orders)}</td>
      <td class="end num">${fmt.money(d.paid + d.remaining)}</td>
      <td class="end num">${fmt.money(d.paid)}</td>
      <td class="end num">${fmt.money(d.remaining)}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

/**
 * Ranked horizontal bars. One series, so one colour; the value sits at the
 * bar's tip and the count beside it, so nothing depends on hovering.
 *
 * @param {{ items: Array<{ key: string, label: string, value: number, note?: string }> }} props
 */
export function BarList({ items }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return html`<div class="bar-list" role="list">
    ${items.map((item) => html`<div class="bar-row" role="listitem" key=${item.key} tabindex="0"
        aria-label=${`${item.label}: ${fmt.money(item.value)}${item.note ? `، ${item.note}` : ''}`}>
      <span class="bar-label">${item.label}</span>
      <span class="bar-track">
        <i style=${{ width: `${Math.max(1.5, (item.value / max) * 100)}%` }} />
        <span class="bar-value num">${fmt.money(item.value)}</span>
      </span>
      <span class="bar-note faint">${item.note}</span>
    </div>`)}
  </div>`;
}

/** Share collected of everything billed, as a ring with the figure inside. */
export function Ring({ ratio, label }) {
  const size = 132;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = useRef(null);
  const [drawn, setDrawn] = useState(0);
  // Draw the arc from empty on first paint.
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(Math.max(0, Math.min(1, ratio))));
    return () => cancelAnimationFrame(id);
  }, [ratio]);

  return html`<div class="ring" role="img" aria-label=${`${label} ${fmt.percent(ratio)}`}>
    <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`}>
      <circle cx=${size / 2} cy=${size / 2} r=${radius} fill="none" stroke="var(--series-wash)" stroke-width=${stroke} />
      <circle ref=${arc} cx=${size / 2} cy=${size / 2} r=${radius} fill="none" stroke="var(--series)" stroke-width=${stroke}
        stroke-linecap="round" stroke-dasharray=${`${circumference * drawn} ${circumference}`}
        transform=${`rotate(-90 ${size / 2} ${size / 2})`} class="ring-arc" />
    </svg>
    <div class="ring-center"><strong class="num">${fmt.percent(ratio)}</strong></div>
  </div>`;
}

/** Twelve tiny columns: the trend in muted ink, the current period in the accent. */
export function Sparkline({ values, label }) {
  const max = Math.max(...values, 1);
  const width = 6;
  const gap = 3;
  const height = 28;
  return html`<svg class="spark" width=${values.length * (width + gap) - gap} height=${height} role="img" aria-label=${label}>
    ${values.map((value, index) => {
    const h = Math.max(2, (value / max) * height);
    // Newest on the left, like the main chart.
    const x = (values.length - 1 - index) * (width + gap);
    return html`<rect key=${index} x=${x} y=${height - h} width=${width} height=${h} rx="1.5"
        fill=${index === values.length - 1 ? 'var(--series)' : 'var(--fill-press)'} />`;
  })}
  </svg>`;
}
