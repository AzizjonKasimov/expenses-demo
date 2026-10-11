// Mirrors logic/Categories.kt and logic/SplitMode.kt. The taxonomy itself is exported from the app
// (without the personal subcategories demo mode hides), so it is loaded rather than written here.

let MAP = new Map();

export const Categories = {
  /** [taxonomy] is the exported list of [category, subcategories] pairs, in the app's order. */
  load(taxonomy) {
    MAP = new Map(taxonomy.map(([name, subcategories]) => [name, [...subcategories]]));
  },
  get NAMES() {
    return [...MAP.keys()];
  },
  has(category) {
    return MAP.has(category);
  },
  subcategories(category) {
    return MAP.get(category) ?? [];
  },
};

export const SplitModes = {
  UNSET: 'unset',
  I_PAY_FULL: 'i_pay_full',
  HALF: 'half',
  SHE_PAYS_FULL: 'she_pays_full',
  CUSTOM: 'custom',
};
SplitModes.ALL = new Set(Object.values(SplitModes));
/** Modes whose rows count as money the user actually moved (history/balance/budget). */
SplitModes.COUNTED = new Set([SplitModes.I_PAY_FULL, SplitModes.HALF, SplitModes.CUSTOM]);
