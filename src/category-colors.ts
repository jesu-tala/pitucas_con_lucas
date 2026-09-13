import { Category, TxType } from './types';

// ===================== Algorithmic, unique-per-category colors =====================
// Every category gets a hue (0-359) instead of picking from a fixed 8-name palette. Lightness
// and chroma stay fixed at a "pastel band" (one band for fill, a darker/more saturated one for
// the matching ink/text color) so every category still reads as part of the same visual family
// -- only the hue varies, which is what actually needs to be unique to tell categories apart in
// a pie/donut chart. Colors are expressed as native CSS oklch(), wrapped in light-dark() so the
// same value adapts to the viewer's theme without any JS needing to know which theme is active
// (this app already sets `color-scheme` on :root for exactly this purpose).
const FILL_LIGHT = { l: 0.86, c: 0.075 };
const FILL_DARK  = { l: 0.32, c: 0.10 };
const INK_LIGHT  = { l: 0.38, c: 0.13 };
const INK_DARK   = { l: 0.88, c: 0.09 };

function oklch(l: number, c: number, h: number): string {
  return 'oklch(' + Math.round(l * 1000) / 10 + '% ' + c.toFixed(3) + ' ' + (Math.round(h * 10) / 10) + ')';
}
export function categoryFillCss(hue: number): string {
  return 'light-dark(' + oklch(FILL_LIGHT.l, FILL_LIGHT.c, hue) + ',' + oklch(FILL_DARK.l, FILL_DARK.c, hue) + ')';
}
export function categoryInkCss(hue: number): string {
  return 'light-dark(' + oklch(INK_LIGHT.l, INK_LIGHT.c, hue) + ',' + oklch(INK_DARK.l, INK_DARK.c, hue) + ')';
}
// The `--fill:...;--ink:...` inline-style fragment every category icon/avatar/chip in the app
// builds -- centralized here so there's exactly one place that knows how a category becomes a
// color, instead of ~20 call sites each re-deriving it from a named CSS variable.
export function categoryColorVars(cat: { colorHue: number } | null | undefined): string {
  if (!cat) return '--fill:var(--surface-sunken);--ink:var(--text-tertiary)';
  return '--fill:' + categoryFillCss(cat.colorHue) + ';--ink:' + categoryInkCss(cat.colorHue);
}

// How close two categories' hues can be before they start reading as "the same color" in a
// chart -- used both for the manual-override collision warning and, previously, as a reason
// categories used to visually merge into one donut block before this feature existed.
export const CATEGORY_COLOR_MIN_GAP = 25;

function huesInUse(categories: Record<string, Category>, tipo: TxType, excludeId?: string | null): number[] {
  return Object.keys(categories)
    .filter(id => id !== excludeId && categories[id].tipo === tipo && typeof categories[id].colorHue === 'number')
    .map(id => categories[id].colorHue)
    .sort((a, b) => a - b);
}

function circularGapMidpoint(hues: number[]): number {
  if (hues.length === 0) return 265; // arbitrary starting hue (a lavender-ish blue-violet)
  if (hues.length === 1) return (hues[0] + 180) % 360;
  let bestGap = -1, bestMid = 0;
  for (let i = 0; i < hues.length; i++) {
    const a = hues[i];
    const b = (i + 1 < hues.length ? hues[i + 1] : hues[0] + 360);
    const gap = b - a;
    if (gap > bestGap) { bestGap = gap; bestMid = (a + gap / 2) % 360; }
  }
  return bestMid;
}
// Farthest-point-on-the-hue-circle insertion: finds the single largest angular gap between the
// hues already in use (within the same tipo, since that's the only grouping that ever shares a
// donut) and places the new hue exactly in the middle of it -- the point as far as possible from
// every existing category's color, given what's already taken.
export function nextCategoryHue(categories: Record<string, Category>, tipo: TxType): number {
  return circularGapMidpoint(huesInUse(categories, tipo));
}
function angularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}
// Whether `hue` sits close enough to another category of the same tipo that they'd read as the
// same color in a chart -- used to warn on a manual override, same spirit as the old
// categoriesWithColor() exact-name-match check, but distance-based since hues are continuous now.
export function categoriesCollidingWithHue(categories: Record<string, Category>, tipo: TxType, hue: number, excludeId?: string | null): string[] {
  return Object.keys(categories)
    .filter(id => id !== excludeId && categories[id].tipo === tipo && angularDistance(categories[id].colorHue, hue) < CATEGORY_COLOR_MIN_GAP)
    .map(id => categories[id].nombre);
}

// ---- Migration: existing accounts have categories saved with the old `color: <palette-name>`
// string field instead of colorHue. Map each old name to roughly the hue it used to render as,
// so a migrated category keeps looking like itself instead of jumping to an unrelated color.
const LEGACY_COLOR_HUE: Record<string, number> = {
  lavender: 280, mint: 160, peach: 30, sky: 205,
  pink: 340, butter: 50, sage: 95, neutral: 30
};
export function migrateLegacyCategoryColor(cat: any): number {
  if (typeof cat.colorHue === 'number') return cat.colorHue;
  if (typeof cat.color === 'string' && LEGACY_COLOR_HUE[cat.color] != null) return LEGACY_COLOR_HUE[cat.color];
  return 265;
}
