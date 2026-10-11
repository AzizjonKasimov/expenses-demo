// The web copy's entry point (MainActivity.kt's counterpart): loads what the exporter took from the
// app, then renders the app shell on the visitor's own date.

import { html, render, useEffect, useState } from './ui/html.js';
import { Categories } from './logic/Categories.js';
import { loadBudgetConfig } from './logic/BudgetLogic.js';
import { Refunds } from './logic/Refunds.js';
import { localToday } from './logic/dates.js';
import { DemoStore } from './demo/DemoStore.js';
import { ExpensesApp } from './ui/ExpensesApp.js';

const data = await (await fetch('data/demo-data.json')).json();
Categories.load(data.categories);
loadBudgetConfig(data.budgetConfig);
Object.assign(Refunds, data.refundWindows);

const store = new DemoStore(data, localToday());
const links = { app: document.querySelector('[data-link=app]').href };
const wide = matchMedia('(min-width: 900px)');

function Root() {
  const [, setVersion] = useState(0);
  const [framed, setFramed] = useState(wide.matches);
  useEffect(() => store.subscribe(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    const onChange = () => setFramed(wide.matches);
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, []);
  return html`<${ExpensesApp} vm=${store} framed=${framed} links=${links} />`;
}

render(html`<${Root} />`, document.getElementById('app'));
