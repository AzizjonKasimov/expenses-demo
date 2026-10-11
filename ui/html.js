// Preact with htm tagged templates: components read like the app's composables without a build step.

import { Fragment, h, render } from 'preact';
import htm from 'htm';

export const html = htm.bind(h);
export { Fragment, render };
export { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';

/** Joins class names, skipping falsy ones. */
export const cx = (...names) => names.filter(Boolean).join(' ');
