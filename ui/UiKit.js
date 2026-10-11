// Mirrors ui/UiKit.kt: the app's own building blocks.

import { cx, html } from './html.js';

export function ScreenEmptyState({ title, detail }) {
  return html`<div class="empty-state">
    <div class="t-titleMedium">${title}</div>
    ${detail && html`<div class="t-bodyMedium on-variant empty-detail">${detail}</div>`}
  </div>`;
}

export function SummaryBand({ title, value, supporting, valueColor = 'var(--md-on-surface)', trailing, class: className }) {
  const valueClass = value.length > 14 ? 't-titleLarge' : 't-headlineSmall';
  return html`<div class=${cx('surface-card summary-band', className)}>
    <${ColorDot} color="var(--md-primary)" />
    <div class="summary-text">
      <div class="t-labelMedium on-variant w600">${title}</div>
      <div class=${cx(valueClass, 'w700')} style=${{ color: valueColor }}>${value}</div>
      ${supporting && html`<div class="t-bodySmall on-variant">${supporting}</div>`}
    </div>
    ${trailing}
  </div>`;
}

export function SectionSurface({ title, supporting, children, class: className }) {
  return html`<section class=${cx('surface-card section', className)}>
    ${title && html`<h3 class="t-titleMedium w600 section-title">${title}</h3>`}
    ${supporting && html`<div class="t-bodySmall on-variant">${supporting}</div>`}
    ${children}
  </section>`;
}

export function MetricRow({ stats }) {
  return html`<div class="metric-rows">
    ${stats.map(([label, value]) => html`<div class="metric-row">
      <span class="on-variant">${label}</span><span class="w600">${value}</span>
    </div>`)}
  </div>`;
}

export function SelectionPill({ label, selected, onClick, class: className }) {
  return html`<button type="button" class=${cx('chip', selected && 'selected', className)}
    aria-pressed=${selected} onClick=${onClick}><span class="t-labelLarge">${label}</span></button>`;
}

export function StatusPill({ label, container = 'var(--md-surface-variant)', onClick, class: className }) {
  return onClick
    ? html`<button type="button" class=${cx('status-pill t-labelSmall w600', className)} style=${{ background: container }} onClick=${onClick}>${label}</button>`
    : html`<span class=${cx('status-pill t-labelSmall w600', className)} style=${{ background: container }}>${label}</span>`;
}

export function BarIndicator({ progress, color = 'var(--md-primary)' }) {
  const width = Math.min(Math.max(progress, 0.02), 1) * 100;
  return html`<div class="bar-track"><div class="bar-fill" style=${{ width: `${width}%`, background: color }}></div></div>`;
}

export const ColorDot = ({ color }) => html`<span class="color-dot" style=${{ background: color }}></span>`;
