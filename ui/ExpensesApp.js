// Mirrors ui/ExpensesApp.kt: the header, demo banner, bottom tabs, snackbar and the dialogs that
// wait behind each other (alerts first, then the refund notice or the Telegram preview).

import { cx, html, useEffect, useState } from './html.js';
import { Icon } from './Icons.js';
import { AlertDialog, IconButton, TextButton } from './material.js';
import { MarkScreen } from './MarkScreen.js';
import { HistoryScreen } from './HistoryScreen.js';
import { ChartsScreen } from './ChartsScreen.js';
import { BudgetScreen } from './BudgetScreen.js';
import { SettingsScreen } from './SettingsScreen.js';
import { RefundNoticeDialog, TelegramPreviewDialog } from './TelegramPreviewDialog.js';

const Screen = {
  MARK: { label: 'Mark', subtitle: 'Review imports', icon: 'Check' },
  HISTORY: { label: 'History', subtitle: 'Saved transactions', icon: 'List' },
  CHARTS: { label: 'Charts', subtitle: 'Spending patterns', icon: 'Star' },
  BUDGET: { label: 'Budget', subtitle: 'Dates budget', icon: 'ShoppingCart' },
  SETTINGS: { label: 'Settings', subtitle: 'Private app setup', icon: 'Settings' },
};

const BOTTOM_TABS = [Screen.MARK, Screen.HISTORY, Screen.CHARTS, Screen.BUDGET];

/** Short snackbars stay up about four seconds, like SnackbarDuration.Short. */
const SNACKBAR_MS = 4000;

export function ExpensesApp({ vm, framed, links }) {
  const [current, setCurrent] = useState(Screen.MARK);
  const alert = vm.alerts[0];
  const notice = vm.refundNotice;

  return html`<div class=${cx('app t-bodyLarge', framed && 'framed')}>
    ${framed && html`<${StatusBar} />`}
    <${AppHeader} current=${current} demoMode=${vm.demoMode} onSettings=${() => setCurrent(Screen.SETTINGS)} />
    <div class="app-body">
      ${vm.demoMode && html`<${DemoModeBanner} onReset=${() => vm.resetDemoData()} />`}
      <div class="screen-slot" key=${current.label}>
        ${current === Screen.MARK && html`<${MarkScreen} vm=${vm} />`}
        ${current === Screen.HISTORY && html`<${HistoryScreen} vm=${vm} />`}
        ${current === Screen.CHARTS && html`<${ChartsScreen} vm=${vm} />`}
        ${current === Screen.BUDGET && html`<${BudgetScreen} vm=${vm} />`}
        ${current === Screen.SETTINGS && html`<${SettingsScreen} vm=${vm} links=${links} />`}
      </div>
    </div>
    <${SnackbarHost} message=${vm.message} />
    <nav class="nav-bar" aria-label="Tabs">
      ${BOTTOM_TABS.map((screen) => {
        const selected = current === screen;
        return html`<button type="button" class=${cx('nav-item', selected && 'selected')} aria-current=${selected ? 'page' : undefined}
          onClick=${() => setCurrent(screen)}>
          <span class="nav-indicator"><${Icon} name=${screen.icon} label=${screen.label} /></span>
          <span class="nav-label">${screen.label}</span>
        </button>`;
      })}
    </nav>
    ${framed && html`<div class="gesture-bar"><span></span></div>`}

    ${notice && !alert && html`<${RefundNoticeDialog} message=${notice.message} demoMode=${vm.demoMode}
      onSend=${() => vm.sendRefundNotice()} onDismiss=${() => vm.dismissRefundNotice()} />`}
    ${!notice && vm.telegramPreview.length > 0 && !alert && html`<${TelegramPreviewDialog}
      messages=${vm.telegramPreview} onDismiss=${() => vm.consumeTelegramPreview()} />`}
    ${alert && html`<${AlertDialog} title=${alert.title} text=${alert.message} onDismissRequest=${null}
      confirmButton=${html`<${TextButton} onClick=${() => vm.consumeAlert()}>I understand<//>`} />`}
  </div>`;
}

function AppHeader({ current, demoMode, onSettings }) {
  const subtitle = demoMode && current === Screen.BUDGET ? 'Sample budget' : current.subtitle;
  return html`<header class="app-header">
    <div class="app-header-text">
      <h1 class="t-headlineMedium">${current.label}</h1>
      <div class="t-labelMedium on-variant">${subtitle}</div>
    </div>
    <${IconButton} onClick=${onSettings} label="Settings"><${Icon} name="Settings" /><//>
  </header>`;
}

function DemoModeBanner({ onReset }) {
  return html`<div class="demo-banner">
    <div class="demo-banner-text">
      <div class="t-titleSmall w600">Demo mode</div>
      <div class="t-labelMedium">Sample data only. Your real finances are hidden.</div>
    </div>
    <${TextButton} onClick=${onReset}>Reset<//>
  </div>`;
}

/** Shows each new message once; a newer one replaces it, as LaunchedEffect(message) does. */
function SnackbarHost({ message }) {
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!message) return undefined;
    setShown(message);
    const timer = setTimeout(() => setShown((s) => (s === message ? null : s)), SNACKBAR_MS);
    return () => clearTimeout(timer);
  }, [message]);
  return html`<div class="snackbar-host" aria-live="polite">
    ${shown && html`<div class="snackbar t-bodyMedium" key=${shown}>${shown.text}</div>`}
  </div>`;
}

/** A phone status bar for the framed layout, so the app sits where it does on a phone. */
function StatusBar() {
  const [time, setTime] = useState(clock());
  useEffect(() => {
    const timer = setInterval(() => setTime(clock()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return html`<div class="status-bar" aria-hidden="true">
    <span>${time}</span>
    <span class="status-icons">
      <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21 1 8.5Q3.4 6.4 6.25 5.2 9.1 4 12 4t5.75 1.2Q20.6 6.4 23 8.5z"/></svg>
      <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M2 22 22 2v20z"/></svg>
      <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M8 22q-.43 0-.71-.29Q7 21.43 7 21V5q0-.43.29-.71Q7.57 4 8 4h2V2h4v2h2q.43 0 .71.29.29.28.29.71v16q0 .43-.29.71-.28.29-.71.29z"/></svg>
    </span>
  </div>`;
}

function clock() {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
