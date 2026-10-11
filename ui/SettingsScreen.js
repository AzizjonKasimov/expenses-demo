// Mirrors ui/SettingsScreen.kt as demo mode shows it: sample values that are never saved or sent.

import { html, useState } from './html.js';
import { AlertDialog, Button, LinearProgressIndicator, OutlinedTextField, Switch, TextButton } from './material.js';
import { SectionSurface, SummaryBand } from './UiKit.js';
import { Categories } from '../logic/Categories.js';

export function SettingsScreen({ vm, links }) {
  const s = vm.importSettings;
  const backup = vm.githubBackupState;
  const busy = vm.busy;
  const demoMode = vm.demoMode;
  const [gatewayToken, setGatewayToken] = useState(s.gatewayToken);
  const [excelPassword, setExcelPassword] = useState(s.excelPassword);
  const [telegramToken, setTelegramToken] = useState(s.telegramBotToken);
  const [telegramChatId, setTelegramChatId] = useState(s.telegramChatId);
  const [gmailAddress, setGmailAddress] = useState(s.gmailAddress);
  const [gmailAppPassword, setGmailAppPassword] = useState(s.gmailAppPassword);
  const [mappingsText, setMappingsText] = useState(formatMappings(s.mappings));
  const [ignoreText, setIgnoreText] = useState(s.ignorePatterns.join('\n'));
  const [githubToken, setGithubToken] = useState(backup.config.token);
  const [githubAutoBackup, setGithubAutoBackup] = useState(backup.config.autoBackup);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [leaveDemo, setLeaveDemo] = useState(false);
  const mappingErrors = validateMappings(mappingsText);

  const saveAll = () => {
    vm.saveImportSettings({
      ...s, gatewayToken, excelPassword, telegramBotToken: telegramToken, telegramChatId, gmailAddress, gmailAppPassword,
      mappings: parseMappingsText(mappingsText), ignorePatterns: parseListText(ignoreText),
    });
    vm.saveGitHubBackupSettings({ ...backup.config, token: githubToken, autoBackup: githubAutoBackup });
  };

  let backupValue = 'Backup not active';
  if (backup.backupNeeded) backupValue = 'Backup required';
  else if (configured(backup.config) && backup.config.autoBackup) backupValue = 'Backup ready';

  return html`<div class="screen scroll"><div class="list">
    ${busy && html`<${LinearProgressIndicator} />`}
    <${SectionSurface} title="Demo mode">
      <div class="row between center gap12">
        <div class="grow column gap2">
          <span class="w500">Presentation sandbox</span>
          <span class="t-bodySmall on-variant">
            ${demoMode
              ? 'Every feature runs on fake data. The settings below are samples: nothing is saved, sent, or uploaded.'
              : 'Show every feature on fake data while your real data and setup stay hidden.'}
          </span>
        </div>
        <!-- The web copy has no real data to switch to, so turning demo mode off explains where to get the app. -->
        <${Switch} checked=${demoMode} disabled=${busy} label="Demo mode" onChange=${() => setLeaveDemo(true)} />
      </div>
      ${demoMode && html`<div><${Button} disabled=${busy} onClick=${() => vm.resetDemoData()}>Reset sample data<//></div>`}
    <//>

    <${SummaryBand} title="Configuration" value=${backupValue}
      supporting=${`${s.gatewayToken.trim() !== '' ? 'AI token saved' : 'AI token missing'} · Last GitHub backup: ${formatBackupTime(backup.lastBackupAt)}`}
      trailing=${html`<${Button} disabled=${busy || mappingErrors.length > 0} onClick=${saveAll}>Save<//>`} />

    <${SectionSurface} title="App updates">
      <div class="row between center gap12">
        <div class="grow column gap2">
          <span class="on-variant">Installed version</span>
          <span class="t-titleMedium w600">${`v${vm.data.appVersion} (${vm.data.appVersionCode})`}</span>
        </div>
        <${Button} style=${{ width: '116px' }} onClick=${() => vm.showMessage('App is up to date')}>Check<//>
      </div>
    <//>

    <${SectionSurface} title="Import">
      <${OutlinedTextField} value=${gatewayToken} onValueChange=${setGatewayToken} label="AI gateway access token" password
        supportingText="The gateway selects the model, so there is nothing to configure here." />
      <${OutlinedTextField} value=${excelPassword} onValueChange=${setExcelPassword} label="Excel password" password />
    <//>

    <${SectionSurface} title="Receipt lookup">
      <div class="t-bodySmall on-variant">
        Reads Coupang order mails so purchases are named by what you bought instead of the payment gateway. Use a Google app password, not your account password.
      </div>
      <${OutlinedTextField} value=${gmailAddress} onValueChange=${setGmailAddress} label="Gmail address" />
      <${OutlinedTextField} value=${gmailAppPassword} onValueChange=${setGmailAppPassword} label="Gmail app password" password
        supportingText="Leave both blank to turn receipt lookup off." />
      <div><${Button} disabled=${busy || gmailAddress.trim() === '' || gmailAppPassword.trim() === ''}
        onClick=${() => vm.testReceiptLookup(gmailAddress, gmailAppPassword)}>Test receipt lookup<//></div>
    <//>

    <${SectionSurface} title="Telegram">
      <${OutlinedTextField} value=${telegramToken} onValueChange=${setTelegramToken} label="Bot token" password />
      <${OutlinedTextField} value=${telegramChatId} onValueChange=${setTelegramChatId} label="Group chat ID" />
    <//>

    <${SectionSurface} title="Rules">
      <${OutlinedTextField} value=${mappingsText} onValueChange=${setMappingsText} label="pattern | category | subcategory" minLines=${4} />
      ${mappingErrors.length > 0 && html`<div class="column gap3">
        ${mappingErrors.slice(0, 3).map((e) => html`<div class="t-bodySmall error-text">${e}</div>`)}
      </div>`}
      <${OutlinedTextField} value=${ignoreText} onValueChange=${setIgnoreText} label="Ignore incoming patterns" minLines=${3} />
    <//>

    <${SectionSurface} title="GitHub backup">
      <div class="t-bodyMedium w500">${backup.config.owner}/${backup.config.repo} · ${backup.config.path}</div>
      <div class="w700" style=${{ color: backup.backupNeeded || backup.lastBackupAt === 0 ? 'var(--md-error)' : 'var(--md-primary)' }}>
        ${backup.backupNeeded ? 'Status: BACKUP REQUIRED' : backup.lastBackupAt === 0 ? 'Status: No successful backup recorded' : 'Status: Backed up'}
      </div>
      <div class="t-bodySmall on-variant">Last successful backup: ${formatBackupTime(backup.lastBackupAt)}</div>
      <${OutlinedTextField} value=${githubToken} onValueChange=${setGithubToken} label="GitHub token" password />
      <div class="row between center">
        <span class="w500">Auto backup</span>
        <${Switch} checked=${githubAutoBackup} disabled=${busy} label="Auto backup" onChange=${setGithubAutoBackup} />
      </div>
      <div class="row gap8">
        <${Button} disabled=${busy || !configured(backup.config)} onClick=${() => vm.backupGitHubNow()}>Back up now<//>
        <${TextButton} disabled=${busy || !configured(backup.config)} onClick=${() => setConfirmRestore(true)}>Restore<//>
      </div>
    <//>
  </div>

  ${confirmRestore && html`<${AlertDialog} title="Restore from GitHub?" onDismissRequest=${() => setConfirmRestore(false)}
    text=${demoMode ? 'Demo mode reloads the sample data. Nothing is downloaded.' : 'Local transactions will be replaced by the SQL file in GitHub.'}
    confirmButton=${html`<${Button} onClick=${() => { setConfirmRestore(false); vm.restoreFromGitHub(); }}>Restore<//>`}
    dismissButton=${html`<${TextButton} onClick=${() => setConfirmRestore(false)}>Cancel<//>`} />`}
  ${leaveDemo && html`<${AlertDialog} title="This is the web demo" onDismissRequest=${() => setLeaveDemo(false)}
    text="It only has sample data. To track your own bank statements, install the Android app."
    confirmButton=${html`<${Button} onClick=${() => { setLeaveDemo(false); window.open(links.app, '_blank', 'noopener'); }}>Get the app<//>`}
    dismissButton=${html`<${TextButton} onClick=${() => setLeaveDemo(false)}>Stay in demo<//>`} />`}
  </div>`;
}

const configured = (c) => [c.owner, c.repo, c.branch, c.path, c.token].every((v) => v.trim() !== '');

/** formatBackupTime: "yyyy-MM-dd HH:mm" in local time, or "Never". */
function formatBackupTime(timestamp) {
  if (timestamp <= 0) return 'Never';
  const d = new Date(timestamp);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const formatMappings = (mappings) => mappings.map((m) => [m.pattern, m.category, m.subcategory].join(' | ')).join('\n');

function parseMappingsText(text) {
  return text.split('\n').flatMap((line) => {
    const parts = line.split('|').map((p) => p.trim());
    const [pattern = '', category = '', subcategory = ''] = parts;
    return pattern === '' || category === '' ? [] : [{ pattern, category, subcategory }];
  });
}

function validateMappings(text) {
  return text.split('\n').flatMap((raw, index) => {
    const line = raw.trim();
    if (line === '') return [];
    const [pattern = '', category = '', subcategory = ''] = line.split('|').map((p) => p.trim());
    if (pattern === '' || category === '') return [`Line ${index + 1}: use pattern | category | subcategory`];
    if (!Categories.has(category)) return [`Line ${index + 1}: unknown category "${category}"`];
    if (subcategory !== '' && !Categories.subcategories(category).includes(subcategory)) {
      return [`Line ${index + 1}: unknown subcategory "${subcategory}"`];
    }
    return [];
  });
}

const parseListText = (text) => text.split('\n').flatMap((l) => l.split(',')).map((p) => p.trim()).filter((p) => p !== '');
