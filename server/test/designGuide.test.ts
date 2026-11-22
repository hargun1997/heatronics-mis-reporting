// Design checks (design-system/GUIDE.md "Testing the design" + "Build rules for code"). They read the client source and fail
// on: raw hex / rgb colours in components, one-off text sizes (text-[13.5px]), z-index outside the guide's levels, uppercase
// labels, old colour names (blue, violet, indigo, orange ...), the browser's alert / confirm / prompt, hand-built
// `fixed inset-0` overlays outside the kit, and contractions / em dashes / "please" in UI text.
// Old lines nobody has reached yet sit in design-allowlist.json as a count per file and check: the count may only go DOWN.
// To refresh it after a clean-up: `DESIGN_ALLOWLIST_WRITE=1 npm test -- --test-name-pattern=design`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '../../client/src');
const ALLOW_FILE = path.join(here, 'design-allowlist.json');

// Files that may hold raw colours or caps: token / chart colour tables, PDF and Excel builders, report HTML, data.
const COLOUR_OK = [/^data\//, /^utils\//, /^content\//, /mis-deck\/format\.ts$/, /\.generated\./, /Export\.ts$/, /Pdf\.ts$/, /export/i];
// The kit: the only files that may build a fixed full-screen layer.
const OVERLAY_KIT = new Set(['components/ui/overlays.tsx', 'components/shell/AppNav.tsx', 'components/shell/CommandPalette.tsx']);
// UI code: components, pages, layouts (not pure data / maths).
const isUi = (rel: string) => /^(components|pages|layouts)\//.test(rel) || rel === 'App.tsx';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

/** UI words: JSX text between tags and string literals that read like a sentence (a space and a letter). */
function uiStrings(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) out.push(m[1]);
  for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const s = m[1] ?? m[2] ?? m[3] ?? '';
    if (/[A-Za-z][,.:!?]? [A-Za-z]/.test(s)) out.push(s);
  }
  return out;
}

const CONTRACTION = /\b(?:don|can|won|isn|aren|doesn|didn|wasn|weren|haven|hasn|hadn|couldn|shouldn|wouldn|mustn|it|that|there|here|what|who|you|we|they|let|i)['’](?:t|s|re|ll|ve|d|m)\b/i;

type Counts = Record<string, Record<string, number>>;

function scan(): Counts {
  const counts: Counts = {};
  const add = (rel: string, check: string, n: number) => {
    if (!n) return;
    (counts[rel] ??= {})[check] = n;
  };
  for (const abs of walk(SRC)) {
    const rel = path.relative(SRC, abs).split(path.sep).join('/');
    const raw = fs.readFileSync(abs, 'utf8');
    const code = stripComments(raw);
    const ui = isUi(rel);
    const colourOk = COLOUR_OK.some((r) => r.test(rel));
    if (ui && !colourOk) {
      add(rel, 'raw-colour', (code.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|\brgba?\(\s*\d/g) ?? []).filter((x) => !/^#\d{3}$/.test(x)).length);
      add(rel, 'uppercase', (code.match(/(?<![\w-])uppercase(?![\w-])/g) ?? []).length);
    }
    add(rel, 'text-size', (code.match(/\btext-\[\d+(?:\.\d+)?(?:px|rem)\]/g) ?? []).length);
    add(rel, 'z-index', (code.match(/\bz-\[\d+\]|\bz-(?:30|60|70)\b/g) ?? []).length);
    add(rel, 'old-colour', (code.match(/(?<![\w-])(?:[a-z]+:)*(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow|decoration)-(?:blue|sky|cyan|violet|purple|fuchsia|indigo|pink|orange)-\d{2,3}\b/g) ?? []).length);
    add(rel, 'browser-dialog', (code.match(/\bwindow\.(?:alert|confirm|prompt)\s*\(|(?<![.\w])(?:alert|prompt)\s*\(\s*['"`]/g) ?? []).length);
    if (ui && !OVERLAY_KIT.has(rel)) add(rel, 'hand-overlay', (code.match(/\bfixed inset-0\b/g) ?? []).length);
    if (ui) {
      const words = uiStrings(code);
      add(rel, 'contraction', words.filter((w) => CONTRACTION.test(w)).length);
      add(rel, 'em-dash', words.filter((w) => w.includes('—')).length);
      add(rel, 'please', words.filter((w) => /\bplease\b/i.test(w)).length);
      add(rel, 'avoid-words', words.filter((w) => /\bsuccessfully\b|\be\.g\.|\bsorry\b/i.test(w)).length);
    }
  }
  return counts;
}

test('design guide: no new raw colours, one-off sizes, caps labels, browser dialogs, hand-built overlays or copy breaks (contractions, em dashes, please, successfully, e.g., sorry)', () => {
  const now = scan();
  if (process.env.DESIGN_ALLOWLIST_WRITE) {
    const sorted = Object.fromEntries(Object.keys(now).sort().map((k) => [k, now[k]]));
    fs.writeFileSync(ALLOW_FILE, JSON.stringify({
      _comment: 'Old lines not yet moved to design-system/GUIDE.md. A count may only go down; new files start at zero. Refresh with DESIGN_ALLOWLIST_WRITE=1 after a clean-up.',
      files: sorted,
    }, null, 1) + '\n');
  }
  const allow: Counts = fs.existsSync(ALLOW_FILE) ? JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8')).files : {};
  const breaks: string[] = [];
  for (const [file, checks] of Object.entries(now)) {
    for (const [check, n] of Object.entries(checks)) {
      const ok = allow[file]?.[check] ?? 0;
      if (n > ok) breaks.push(`${file}: ${check} ${n} (allowed ${ok})`);
    }
  }
  assert.deepEqual(breaks, [], `New design breaks (see design-system/GUIDE.md):\n${breaks.join('\n')}`);
});

test('design guide: the kit stays the one source of overlays and buttons', () => {
  const overlays = fs.readFileSync(path.join(SRC, 'components/ui/overlays.tsx'), 'utf8');
  assert.match(overlays, /useOverlay\(open, panel, onClose\)/, 'Modal and Drawer use useOverlay (focus trap, Esc, focus return)');
  assert.match(overlays, /aria-labelledby/);
  const states = fs.readFileSync(path.join(SRC, 'components/ui/states.tsx'), 'utf8');
  assert.match(states, /BTN = buttonClass\('secondary'\)/, 'BTN is the kit Button look');
  const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
  assert.match(app, /<FeedbackHost \/>/, 'Confirm, Ask and Toast are mounted once');
});

test('design guide: the guide file is in the repo', () => {
  const guide = fs.readFileSync(path.join(here, '../../design-system/GUIDE.md'), 'utf8');
  assert.match(guide, /^# Heatronics portal guide/);
});
