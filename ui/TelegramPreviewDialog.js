// Mirrors ui/TelegramPreviewDialog.kt: the messages Finish would send, shown instead of sent, and
// the question asked before a saved refund's message goes out.

import { html } from './html.js';
import { AlertDialog, Button, TextButton } from './material.js';

export function TelegramPreviewDialog({ messages, onDismiss }) {
  return html`<${AlertDialog} title="Telegram preview" onDismissRequest=${onDismiss}
    text=${html`<div class="column gap10">
      <div class="t-bodySmall on-variant">Demo mode sends nothing. The group chat would receive:</div>
      ${messages.map((m) => html`<${MessageBubble} message=${m} />`)}
    </div>`}
    confirmButton=${html`<${TextButton} onClick=${onDismiss}>OK<//>`} />`;
}

export function RefundNoticeDialog({ message, demoMode, onSend, onDismiss }) {
  return html`<${AlertDialog} title="Tell her in Telegram?" onDismissRequest=${onDismiss}
    text=${html`<div class="column gap10">
      <div class="t-bodySmall on-variant">This refund lowered her share of a split she was already told about. Send the group chat:</div>
      <${MessageBubble} message=${message} />
    </div>`}
    confirmButton=${html`<${Button} onClick=${onSend}>${demoMode ? 'Preview' : 'Send'}<//>`}
    dismissButton=${html`<${TextButton} onClick=${onDismiss}>Not now<//>`} />`;
}

/** The notifier writes Telegram HTML: escaped text plus <b>. Only <b> is turned back into markup. */
function MessageBubble({ message }) {
  const parts = message.split(/(<b>.*?<\/b>)/s).map((part) =>
    part.startsWith('<b>') ? html`<b>${unescape(part.slice(3, -4))}</b>` : unescape(part),
  );
  return html`<div class="bubble t-bodyMedium">${parts}</div>`;
}

const unescape = (text) => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
