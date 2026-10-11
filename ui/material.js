// Stand-ins for the androidx.compose.material3 components the app uses, styled in styles.css to the
// app's resolved theme (data/theme.css). Only what the screens need, with the same names and slots.

import { cx, html, useEffect, useRef } from './html.js';

/** Button, OutlinedButton and TextButton. */
export function Button({ kind = 'filled', onClick, disabled = false, class: className, style, children, label }) {
  return html`<button type="button" class=${cx('btn', `btn-${kind}`, className)} style=${style}
    disabled=${disabled} onClick=${onClick} aria-label=${label}>${children}</button>`;
}

export const OutlinedButton = (props) => Button({ ...props, kind: 'outlined' });
export const TextButton = (props) => Button({ ...props, kind: 'text' });

export function IconButton({ onClick, label, children }) {
  return html`<button type="button" class="icon-btn" onClick=${onClick} aria-label=${label} title=${label}>${children}</button>`;
}

export const HorizontalDivider = () => html`<hr class="divider" />`;

export const LinearProgressIndicator = () => html`<div class="progress" role="progressbar" aria-label="Working"></div>`;

export function Switch({ checked, onChange, disabled = false, label }) {
  return html`<button type="button" role="switch" aria-checked=${checked} aria-label=${label}
    class=${cx('switch', checked && 'on')} disabled=${disabled} onClick=${() => onChange(!checked)}>
    <span class="thumb"></span>
  </button>`;
}

/**
 * AlertDialog: a scrim, a title, a scrolling text slot and end-aligned buttons. [onDismissRequest]
 * runs for a tap on the scrim or Escape; pass null for dialogs that must be answered.
 */
export function AlertDialog({ title, text, confirmButton, dismissButton, onDismissRequest }) {
  const dialog = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && onDismissRequest) onDismissRequest();
    };
    document.addEventListener('keydown', onKey);
    dialog.current?.querySelector('input, textarea')?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && onDismissRequest?.()}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label=${title} ref=${dialog}>
      ${title && html`<h2 class="dialog-title t-headlineSmall">${title}</h2>`}
      ${text && html`<div class="dialog-text t-bodyMedium">${text}</div>`}
      <div class="dialog-actions">${dismissButton}${confirmButton}</div>
    </div>
  </div>`;
}

/**
 * OutlinedTextField with a floating label, error state and supporting text. [minLines] > 1 or
 * singleLine false gives a growing text area.
 */
export function OutlinedTextField({
  value, onValueChange, label, placeholder, singleLine = true, minLines = 1, password = false,
  isError = false, supportingText, inputMode, enabled = true, class: className,
}) {
  const multiline = !singleLine || minLines > 1;
  const floated = value !== '' || Boolean(placeholder);
  const common = {
    class: 'field-input',
    value,
    placeholder: placeholder ?? ' ',
    disabled: !enabled,
    onInput: (e) => onValueChange(e.currentTarget.value),
    'aria-invalid': isError,
    'aria-label': label ? undefined : 'Value',
  };
  const input = multiline
    ? html`<textarea ...${common} rows=${Math.max(minLines, 1)} onInput=${(e) => { grow(e.currentTarget); common.onInput(e); }} ref=${(el) => el && grow(el)}></textarea>`
    : html`<input ...${common} type=${password ? 'password' : 'text'} inputmode=${inputMode} autocomplete="off" spellcheck="false" />`;
  return html`<div class=${cx('field-wrap', className)}>
    <label class=${cx('field', multiline && 'multiline', floated && 'floated', isError && 'error', !label && 'no-label', !enabled && 'disabled')}>
      ${input}
      ${label && html`<span class="field-label">${label}</span>`}
      <fieldset class="field-outline" aria-hidden="true"><legend>${label && html`<span>${label}</span>`}</legend></fieldset>
    </label>
    ${supportingText && html`<div class=${cx('field-support', isError && 'error')}>${supportingText}</div>`}
  </div>`;
}

function grow(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * What DropdownMenu does in the app, as a native picker laid invisibly over [children] (the button
 * the app shows), so phones get their own list and nothing is clipped inside a scrolling dialog.
 */
export function DropdownPicker({ options, optionLabel = (o) => o, onSelect, label, children, class: className }) {
  // Like a menu, the picker keeps no selection: it snaps back to its hidden first entry, so picking
  // the option already shown still counts as a pick.
  const onChange = (e) => {
    const index = e.currentTarget.selectedIndex - 1;
    e.currentTarget.selectedIndex = 0;
    if (index >= 0) onSelect(options[index]);
  };
  return html`<div class=${cx('picker', className)}>
    ${children}
    <select class="picker-select" aria-label=${label} onChange=${onChange}>
      <option value="" selected disabled hidden>${label}</option>
      ${options.map((o, i) => html`<option value=${i}>${optionLabel(o)}</option>`)}
    </select>
  </div>`;
}
