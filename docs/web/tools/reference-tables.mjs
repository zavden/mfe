/* Rewrites the generated tables of the reference pages from the data the capture tool reads out
 * of the app, so that they can be made again whenever the app changes:
 *
 *   node docs/web/tools/reference-tables.mjs            rewrite the tables of the pages
 *   node docs/web/tools/reference-tables.mjs --check    write nothing; say what would change; exit
 *                                                       1 when a page is out of date or a note is
 *                                                       missing
 *   node docs/web/tools/reference-tables.mjs --strict   a linked page that is still a stub is a
 *                                                       problem, not a warning (the run to make
 *                                                       once every page is merged)
 *   node docs/web/tools/reference-tables.mjs --web DIR  work on the docs/web tree DIR (a copy), to
 *                                                       try a run before it is made on the real one
 *
 * A table is the text between two marker comments of a page,
 *
 *   <!-- reference-table:shortcuts begin -->  …  <!-- reference-table:shortcuts end -->
 *
 * which this tool replaces whole: never edit between the markers. The tables are static HTML, so
 * that the search of the site finds them and a reader without scripts sees them.
 *
 * Where the tables come from:
 *   shortcuts            media/reference/shortcuts/sheet.data.js (the app's own shortcut sheet),
 *                        with the page each row points to from reference-tables/shortcut-links.mjs.
 *                        A row that the sheet has otherwise on a Mac (its `mac`) is written twice,
 *                        for a reader elsewhere (`span.not-mac`) and for one on a Mac
 *                        (`span.only-mac`): the stylesheet shows the reader's
 *   menu:<id>            media/reference/menus/menu-bar.data.js, one table per menu of the bar
 *                        (and `menu:export-button` for the arrow of the Export… button: the bar
 *                        has no Export menu, its exports are that menu's entries). The data has
 *                        the keys Windows and Linux show: an entry whose keys are others on a Mac
 *                        takes them from `MENU_MAC_KEYS` (reference-tables/menu-notes.mjs), as the
 *                        `data-keys-mac` of its `kbd`
 *   context:<id>         media/reference/menus/context-menus.data.js, one table per right-click
 *                        menu (several scenarios of the data merge into one table where the menu
 *                        differs by kind of object)
 *   preferences:<group>  media/reference/preferences/defaults.data.js, with the words of each
 *                        preference from reference-tables/preference-notes.mjs
 * What each entry does, and the page that teaches it, is written in reference-tables/*.mjs: an
 * entry of the app without its note is reported and nothing is written, so a new entry of the app
 * cannot reach the pages unexplained. The links are labelled with the titles of the pages they
 * point to (their `mfe:short` or `h1`): run this tool again after the pages change.
 *
 * Capture the data first (`node docs/web/tools/capture.mjs reference`) when the app changed. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { WEB_DIR } from './lib/paths.mjs';
import { SHORTCUT_EXTRA, SHORTCUT_LINKS } from './reference-tables/shortcut-links.mjs';
import { CONTEXT_GROUPS, CONTEXT_NOTES, MENU_BAR_NOTES, MENU_MAC_KEYS } from './reference-tables/menu-notes.mjs';
import { PREFERENCE_GROUPS, PREFERENCES } from './reference-tables/preference-notes.mjs';

const ARGS = process.argv.slice(2);
const webOption = ARGS.indexOf('--web');
/** The docs/web tree the tool reads and writes: the checkout's own unless `--web DIR` says another. */
const WEB = webOption >= 0 && ARGS[webOption + 1] ? resolve(ARGS[webOption + 1]) : WEB_DIR;
const MEDIA = join(WEB, 'media', 'reference');

/** The pages that hold tables, and the tables each one must hold, in order. */
const PAGES = {
  'reference/shortcuts': ['shortcuts'],
  'reference/menus': [
    'menu:file',
    'menu:edit',
    'menu:view',
    'menu:preferences',
    'menu:export-button',
    'menu:help',
    ...CONTEXT_GROUPS.map((group) => `context:${group.id}`),
  ],
  'reference/preferences': PREFERENCE_GROUPS.map((group) => `preferences:${group.id}`),
};

// ---- Helpers ---------------------------------------------------------------------------------

const esc = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A `MFE_DATA` file read as the page reads it. */
function loadData(file) {
  const path = join(MEDIA, file);
  if (!existsSync(path)) throw new Error(`${path} is missing: capture it first`);
  const window = {};
  vm.runInNewContext(readFileSync(path, 'utf8'), { window });
  return Object.values(window.MFE_DATA)[0];
}

const problems = [];
const problem = (message) => problems.push(message);

/** The entries of the menu bar whose Mac keys (`MENU_MAC_KEYS`) a table has written. */
const MAC_KEYS_USED = new Set();
/** The pages a table links to that are still stubs in this checkout: their names are not final. */
const stubs = new Set();

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name) => ENTITIES[name]);

/** The `content` of the <meta> tag of a page named `name`, whatever the order of its attributes. */
function metaContent(html, name) {
  for (const tag of html.matchAll(/<meta\s[^>]*>/g)) {
    if (new RegExp(`name\\s*=\\s*"${name}"`).test(tag[0])) {
      const content = /content\s*=\s*"([^"]*)"/.exec(tag[0]);
      if (content) return decode(content[1]).trim();
    }
  }
  return null;
}

const pageCache = new Map();
/** What a link to a page needs of it: its name (its `mfe:short`, else its h1 as text) and whether
 * it is still a stub. A page that does not exist is a problem. */
function pageInfo(id) {
  if (!pageCache.has(id)) {
    const path = join(WEB, `${id}.html`);
    let info = { label: id, stub: false, ids: new Set() };
    if (existsSync(path)) {
      const html = readFileSync(path, 'utf8');
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
      const heading = h1 ? decode(h1[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() : null;
      info = {
        label: metaContent(html, 'mfe:short') || heading || id,
        stub: metaContent(html, 'mfe:status') === 'stub',
        ids: new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])),
      };
      if (info.stub) stubs.add(id);
    } else {
      problem(`a link points to ${id}, which is not a page`);
    }
    pageCache.set(id, info);
  }
  return pageCache.get(id);
}

/** A link to a page, or to a section of it (`'basics/preview#grid'`), named with the page's own
 * name. A section a page has not got is a problem (a stub has none yet: its link is not checked). */
function link(spec) {
  if (!spec) return '';
  const [id, anchor] = spec.split('#');
  const info = pageInfo(id);
  if (anchor && info.ids.size > 0 && !info.stub && !info.ids.has(anchor)) {
    problem(`a link points to ${id}#${anchor}, and that page has no section with that id`);
  }
  return `<a href="../${id}.html${anchor ? `#${anchor}` : ''}">${esc(info.label)}</a>`;
}

const ui = (label) => `<span class="ui">${esc(label)}</span>`;

/** The words of a note as HTML: escaped, and `[[Label]]` is an interface label of the app, word
 * for word, written as `<span class="ui">`. */
function rich(text) {
  const html = esc(text).replace(/\[\[(.+?)\]\]/g, (_, label) => `<span class="ui">${label}</span>`);
  if (/\[\[|\]\]/.test(html)) problem(`a note has an unmatched [[ ]]: ${text}`);
  return html;
}

// ---- Keys ------------------------------------------------------------------------------------

const MOD = 'Ctrl/⌘';
const TOKEN = { [MOD]: 'Mod', '←': 'ArrowLeft', '→': 'ArrowRight', '↑': 'ArrowUp', '↓': 'ArrowDown', Del: 'Delete', Esc: 'Escape' };
const SHOWN = { Mod: 'Ctrl', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc' };
const MAC = { Mod: '⌘', Alt: '⌥', Shift: '⇧', Ctrl: '⌃', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc' };

const tokenOf = (text) => TOKEN[text] ?? text;
const shown = (token) => SHOWN[token] ?? token;

/** One combination of keys as a <kbd data-keys>, which the site writes for the reader's system.
 * `mac`: the combination the app has in its place on a Mac, when it is another (`data-keys-mac`).
 * `forMac`: the combination is written for a reader on a Mac alone, whose Control key is ⌃. */
const kbd = (tokens, { mac = null, forMac = false } = {}) =>
  tokens.includes('Ctrl') && !forMac
    ? `<kbd>${esc(tokens.join('+'))}</kbd>` // Control itself, written for every system: a cap that never changes
    : `<kbd data-keys="${esc(tokens.join('+'))}"${mac ? ` data-keys-mac="${esc(mac)}"` : ''}>${esc(tokens.map(shown).join('+'))}</kbd>`;

/** The modifiers in the order a Mac's menus write them: Control, Option, Shift, Command. */
const MAC_ORDER = ['Ctrl', 'Alt', 'Shift', 'Mod'];
const macOrder = (tokens) => [
  ...MAC_ORDER.filter((modifier) => tokens.includes(modifier)),
  ...tokens.filter((token) => !MAC_ORDER.includes(token)),
];

/** The text a row can be found by, both for Ctrl and for ⌘ (and the other names of the keys). */
function searchKeys(tokens) {
  const mac = macOrder(tokens).map((token) => MAC[token] ?? token).join('');
  const win = tokens.map(shown).join('+');
  const names = tokens.flatMap((token) =>
    token === 'Mod' ? ['cmd', 'command', 'ctrl', 'control'] : token === 'Alt' ? ['option'] : token === 'Escape' ? ['escape'] : [],
  );
  return [win, mac, ...names].join(' ');
}

/** What a combination of the sheet's `parts` writes: keys as caps, gestures as words. The text
 * of the sheet is "Alt+←/→": a key that holds several ("←/→") is one combination each. */
function comboHtml(combo, haystack, forMac = false) {
  const { parts } = combo;
  if (parts.every((part) => part.kind === 'key')) {
    const last = parts[parts.length - 1].text;
    const lead = parts.slice(0, -1).map((part) => tokenOf(part.text));
    const alternatives = last !== MOD && last.includes('/') && last.length > 1 ? last.split('/') : [last];
    return alternatives
      .map((alternative) => {
        const tokens = [...lead, tokenOf(alternative)];
        haystack.push(searchKeys(tokens));
        return kbd(tokens, { forMac });
      })
      .join(' / ');
  }
  return parts
    .map((part) => {
      if (part.kind === 'gesture') {
        haystack.push(part.text);
        return `<span class="gesture">${esc(part.text)}</span>`;
      }
      haystack.push(searchKeys([tokenOf(part.text)]));
      return kbd([tokenOf(part.text)], { forMac });
    })
    .join(' + ');
}

const SEPARATOR = { ',': ', ', or: ' or ', '/': ' / ' };

function keysCell(lines, haystack, forMac = false) {
  return lines
    .map(({ combos, note }) => {
      const body = combos
        .map(({ separator, ...combo }) => (separator ? SEPARATOR[separator] : '') + comboHtml(combo, haystack, forMac))
        .join('');
      if (!note) return body;
      const lead = note.key ? `${kbd([tokenOf(note.key)], { forMac })}: ` : '';
      haystack.push(note.key ?? '', note.text);
      return `${body} (${lead}${esc(note.text)})`;
    })
    .join('<br>');
}

// ---- The shortcut sheet ----------------------------------------------------------------------

/** What a row of the sheet does, then what the sheet leaves unsaid about it (`SHORTCUT_EXTRA`) as
 * a sentence of its own: the sheet's text has no full stop of its own. */
function sentences(what, extra) {
  if (!extra) return esc(what);
  return `${esc(what)}${/[.!?]$/.test(what) ? '' : '.'} ${rich(extra)}`;
}

/** What a cell says, and what it says on a Mac when the sheet has something else there: both are
 * written, each for its reader (the stylesheet shows one, `.only-mac` / `.not-mac`). */
const forEachSystem = (elsewhere, onMac) =>
  onMac === null || onMac === elsewhere
    ? elsewhere
    : `<span class="not-mac">${elsewhere}</span><span class="only-mac">${onMac}</span>`;

function shortcutsTable() {
  const data = loadData('shortcuts/sheet.data.js');
  const seen = new Set();
  const out = ['<div class="shortcut-groups" data-shortcut-groups>'];
  for (const group of data.groups) {
    const id = `keys-${slug(group.title)}`;
    out.push(`<div class="shortcut-group" data-shortcut-group>`, `<h3 id="${id}">${esc(group.title)}</h3>`);
    out.push(
      '<table>',
      `<caption class="sr-only">${esc(group.title)}</caption>`,
      '<thead><tr><th>Keys</th><th>What it does</th><th>Where</th><th>See</th></tr></thead>',
      '<tbody>',
    );
    for (const row of group.rows) {
      seen.add(row.keys);
      const page = SHORTCUT_LINKS[row.keys];
      if (page === undefined) problem(`shortcut row "${row.keys}" has no entry in shortcut-links.mjs`);
      const haystack = [];
      const extra = SHORTCUT_EXTRA[row.keys] ?? '';
      // The row as the sheet has it on a Mac, where it differs: found by its keys there too.
      const mac = row.mac ?? {};
      const cell = forEachSystem(
        keysCell(row.lines, haystack),
        mac.lines ? keysCell(mac.lines, haystack, true) : null,
      );
      const what = forEachSystem(sentences(row.what, extra), mac.what ? sentences(mac.what, extra) : null);
      const where = forEachSystem(esc(row.where), mac.where ? esc(mac.where) : null);
      haystack.push(row.where, row.what, mac.where ?? '', mac.what ?? '', extra.replace(/\[\[|\]\]/g, ''), group.title);
      const search = haystack.join(' ').toLowerCase().replace(/\s+/g, ' ');
      out.push(`<tr data-search="${esc(search)}"><td>${cell}</td><td>${what}</td><td>${where}</td><td>${link(page)}</td></tr>`);
    }
    out.push('</tbody>', '</table>', '</div>');
  }
  out.push('</div>');
  for (const key of Object.keys(SHORTCUT_LINKS)) {
    if (!seen.has(key)) problem(`shortcut-links.mjs has "${key}", which is no row of the sheet`);
  }
  return out.join('\n');
}

// ---- Menus -----------------------------------------------------------------------------------

/** The note of an entry: its test id and label, else its test id, else the family it belongs to
 * (a key ending in `*` is a prefix). Returns null when there is none. */
function noteOf(notes, entry, used) {
  const keys = [];
  if (entry.testId) keys.push(`${entry.testId}|${entry.label}`, entry.testId);
  for (const key of keys) {
    if (notes[key] !== undefined) {
      used.add(key);
      return normal(notes[key]);
    }
  }
  if (entry.testId) {
    const family = Object.keys(notes)
      .filter((key) => key.endsWith('*') && entry.testId.startsWith(key.slice(0, -1)))
      .sort((a, b) => b.length - a.length)[0];
    if (family) {
      used.add(family);
      return normal(notes[family]);
    }
  }
  return null;
}

/** A note in either of its forms, as an object. */
function normal(note) {
  return Array.isArray(note) ? { text: note[0], page: note[1] } : note;
}

const isChoice = (entry) => entry.type === 'item' && entry.role === 'menuitemradio';

/** An entry as the report of a missing note shows it: its test id and label, and the app's own
 * words about it (the hint after the label, the line under it, its tooltip). */
function describeEntry(entry) {
  const words = [
    entry.hint ? `hint "${entry.hint}"` : null,
    entry.note ? `line under it "${entry.note}"` : null,
    entry.title ? `tooltip "${entry.title}"` : null,
  ].filter(Boolean);
  return `${entry.testId ?? '(no test id)'} (${entry.label})${words.length ? ` — ${words.join('; ')}` : ''}`;
}

/** The rows of a menu's entries: `{ label, keys, note, depth, choices, entry }`. */
function menuRows(entries, ctx, depth = 0) {
  const rows = [];
  const families = new Set();
  for (const entry of entries) {
    if (entry.type === 'separator' || entry.type === 'header') continue;
    if (entry.type === 'swatches') {
      const note = normal(ctx.notes['swatches']);
      rows.push({ label: 'Colour swatches', note, depth, entry });
      ctx.used.add('swatches');
      continue;
    }
    const note = noteOf(ctx.notes, entry, ctx.used);
    if (!note) {
      ctx.missing.add(describeEntry(entry));
      continue;
    }
    // A hint (the grey text after a label) is either static, and the note says it, or it changes
    // with the project, and the note says so with `hint: null`.
    const hints = entry.hints ?? (entry.hint ? [entry.hint] : []);
    if (hints.length > 0) {
      if (note.hint === undefined) {
        ctx.missing.add(`${describeEntry(entry)} — its note needs \`hint\`: the text when it does not change, null when it does`);
      } else if (note.hint !== null && hints.some((hint) => hint !== note.hint)) {
        ctx.missing.add(`${describeEntry(entry)} — the hint is no longer "${note.hint}" in the note`);
      }
    }
    // A family of flat entries ("Appear · Write", "Appear · Create"…) is one row.
    const family = Object.keys(ctx.notes).find(
      (key) => key.endsWith('*') && entry.testId?.startsWith(key.slice(0, -1)),
    );
    if (family) {
      if (families.has(family)) continue;
      families.add(family);
      const members = entries.filter((e) => e.testId?.startsWith(family.slice(0, -1)));
      rows.push({ label: note.label ?? entry.label, note, depth, choices: members, entry });
      continue;
    }
    const row = { label: note.label ?? entry.label, note, depth, entry, hint: typeof note.hint === 'string' ? note.hint : null };
    if (entry.type === 'submenu' && entry.items) {
      const items = entry.items.filter((item) => item.type === 'item' || item.type === 'submenu');
      const mode = note.children ?? (items.length > 0 && items.every((i) => isChoice(i)) ? 'inline' : 'auto');
      const noted = items.some((item) => noteOf(ctx.notes, item, new Set()) !== null);
      if (mode === 'hide') {
        // The note says it all.
      } else if (mode === 'inline' || (mode === 'auto' && !noted)) {
        row.choices = items;
      } else {
        row.children = menuRows(entry.items, ctx, depth + 1);
      }
    }
    rows.push(row);
    if (row.children) rows.push(...row.children);
  }
  return rows;
}

/** The sentence a row adds to its note about what it is on by default. */
function stateSentence(row, ctx) {
  const { entry } = row;
  if (!ctx.defaults) return '';
  if (entry.role === 'menuitemcheckbox') return entry.checked ? ' On by default.' : ' Off by default.';
  if (isChoice(entry) && !row.choices) return entry.checked ? ' The default.' : '';
  if (row.choices && row.choices.length > 0 && row.choices.every(isChoice)) {
    const picked = row.choices.find((choice) => choice.checked);
    return picked ? ` Default: ${ui(picked.label)}.` : '';
  }
  return '';
}

const choicesHtml = (choices) =>
  choices.map((choice) => ui(choice.label)).join(', ');

/** One table of rows. `kinds` is the "For" column of a merged context menu, or null. */
function renderMenuTable(title, rows, ctx, kinds) {
  const columns = ctx.keys ? ['Entry', 'Keys', 'What it does', 'See'] : kinds ? ['Entry', 'For', 'What it does', 'See'] : ['Entry', 'What it does', 'See'];
  const out = [
    '<table>',
    `<caption class="sr-only">${esc(title)}</caption>`,
    `<thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>`,
    '<tbody>',
  ];
  for (const row of rows) {
    const { entry, note } = row;
    const sub = row.depth > 0 ? ' class="is-sub"' : '';
    const what =
      rich(note.text) +
      stateSentence(row, ctx) +
      (row.choices && row.choices.length > 0
        ? ` <span class="choices">Choices: ${choicesHtml(row.choices)}.</span>`
        : '');
    const hint = row.hint ? ` <span class="hint">${esc(row.hint)}</span>` : '';
    const cells = [`<td${sub}>${ui(row.label)}${hint}</td>`];
    if (ctx.keys) {
      const mac = MENU_MAC_KEYS[entry.testId] ?? null;
      if (mac) ctx.macKeys.add(entry.testId);
      if (mac && !entry.keys) problem(`MENU_MAC_KEYS has keys for "${entry.testId}", which has none elsewhere`);
      cells.push(`<td>${entry.keys ? kbd(entry.keys.split('+'), { mac }) : ''}</td>`);
    }
    else if (kinds) cells.push(`<td>${esc(kinds(row))}</td>`);
    cells.push(`<td>${what}</td>`, `<td>${link(note.page)}</td>`);
    out.push(`<tr>${cells.join('')}</tr>`);
  }
  out.push('</tbody>', '</table>');
  return out.join('\n');
}

function menuBarTable(id) {
  const data = loadData('menus/menu-bar.data.js');
  const ctx = { notes: MENU_BAR_NOTES, used: new Set(), missing: new Set(), keys: true, defaults: true, macKeys: MAC_KEYS_USED };
  let entries;
  let title;
  if (id === 'export-button') {
    entries = data.exportButton.entries.map((entry) => ({
      ...entry,
      testId: entry.testId?.replace(/^export-button-/, 'menu-item-export-'),
    }));
    title = 'The Export… button’s menu';
  } else {
    const menu = data.menus.find((m) => m.id === id);
    if (!menu) throw new Error(`the menu data has no menu "${id}"`);
    entries = menu.entries;
    title = `The ${menu.label} menu`;
  }
  const rows = menuRows(entries, ctx);
  reportMissing(`menu ${id}`, ctx);
  return renderMenuTable(title, rows, ctx, null);
}

// ---- Context menus ---------------------------------------------------------------------------

/** The colour squares of a Colour menu come from the kit as one item each (label "Colour WHITE");
 * on the page they are one row. */
const isSwatch = (entry) =>
  entry.type === 'item' && /^Colour [A-Z_]+$/.test(entry.label ?? '') && /-color-[A-Z_]+$/.test(entry.testId ?? '');

function collapseSwatches(entries) {
  const out = [];
  for (const entry of entries) {
    if (isSwatch(entry)) {
      const name = entry.label.replace(/^Colour /, '');
      const last = out[out.length - 1];
      if (last?.type === 'swatches') last.names.push(name);
      else out.push({ type: 'swatches', testId: null, names: [name] });
    } else {
      out.push(entry.items ? { ...entry, items: collapseSwatches(entry.items) } : entry);
    }
  }
  return out;
}

/** The entries whose label says something else for another kind of object: they stay apart. */
const SPLIT_BY_LABEL = new Set(['add-animation-tween', 'slide-mark-menu-words']);

/** The scenarios of a group merged into one list of entries, each with the scenarios it is in. */
function mergeScenarios(group, scenarios) {
  const mergeLists = (lists) => {
    const merged = [];
    const keyOf = (entry) =>
      entry.testId
        ? SPLIT_BY_LABEL.has(entry.testId)
          ? `${entry.testId}|${entry.label}`
          : entry.testId
        : `${entry.type}|${entry.label ?? ''}`;
    for (const { id, entries } of lists) {
      let at = -1;
      const real = entries.filter((entry) => entry.type !== 'separator' && entry.type !== 'header');
      for (const [index, entry] of real.entries()) {
        const key = keyOf(entry);
        let found = merged.find((m) => m.key === key);
        if (!found) {
          found = { key, entry, scenarios: new Set(), hints: new Set(), lists: [] };
          // After the entry before it in its own menu; an entry that starts a menu goes before the
          // first later one that is there already, else last.
          let place = merged.length;
          if (at !== -1) place = at + 1;
          else {
            const next = real.slice(index + 1).map((later) => merged.findIndex((m) => m.key === keyOf(later)));
            const known = next.find((position) => position !== -1);
            if (known !== undefined) place = known;
          }
          merged.splice(place, 0, found);
        }
        found.scenarios.add(id);
        if (entry.hint) found.hints.add(entry.hint);
        if (entry.items) found.lists.push({ id, entries: entry.items });
        at = merged.indexOf(found);
      }
    }
    return merged.map((m) => ({
      ...m.entry,
      scenarios: m.scenarios,
      hints: [...m.hints],
      ...(m.lists.length > 0 ? { items: mergeLists(m.lists) } : {}),
    }));
  };
  return mergeLists(scenarios);
}

/** What the "For" column says of a set of scenarios. */
function kindsText(group, ids) {
  const all = Object.keys(group.names);
  if (ids.size === all.length) return 'all';
  const names = all.filter((id) => ids.has(id)).map((id) => group.names[id]);
  const set = new Set(names);
  const out = [];
  const texts = ['formulas', 'LaTeX texts', 'font texts'];
  const lines = ['lines', 'arrows'];
  for (const name of names) {
    if (texts.includes(name) && texts.every((n) => set.has(n))) {
      if (!out.includes('formulas and texts')) out.push('formulas and texts');
    } else if (lines.includes(name) && lines.every((n) => set.has(n))) {
      if (!out.includes('lines and arrows')) out.push('lines and arrows');
    } else {
      out.push(name);
    }
  }
  return out.join(', ');
}

let contextData = null;

function contextTable(id) {
  contextData ??= loadData('menus/context-menus.data.js');
  const group = CONTEXT_GROUPS.find((g) => g.id === id);
  if (!group) throw new Error(`no context group "${id}"`);
  const scenarios = [];
  for (const scenario of Object.keys(group.names)) {
    const found = contextData.menus.find((m) => m.id === scenario);
    if (!found || found.error) {
      problem(
        `the context-menu data has no menu "${scenario}"${found?.error ? ` (${found.error})` : ''}: ` +
          'capture it again (node docs/web/tools/capture.mjs reference/menus)',
      );
    } else {
      scenarios.push(found);
    }
  }
  if (scenarios.length < Object.keys(group.names).length) return '';
  const entries = mergeScenarios(
    group,
    scenarios.map((scenario) => ({ ...scenario, entries: collapseSwatches(scenario.entries) })),
  );
  const ctx = { notes: CONTEXT_NOTES, used: new Set(), missing: new Set(), keys: false, defaults: false };
  const rows = menuRows(entries, ctx);
  reportMissing(`context menu ${id}`, ctx);
  const several = Object.keys(group.names).length > 1;
  return renderMenuTable(
    `The right-click menu: ${Object.values(group.names).join(', ')}`,
    rows,
    ctx,
    several ? (row) => kindsText(group, row.entry.scenarios) : null,
  );
}

function reportMissing(where, ctx) {
  for (const entry of ctx.missing) problem(`${where}: no note for ${entry}`);
}

// ---- Preferences -----------------------------------------------------------------------------

/** A place where a preference is changed: a menu path or a label of the app (`{ ui }`), a key
 * (`{ keys: 'Mod+Alt+S' }`, for <kbd data-keys>) or plain words. */
function whereHtml(place) {
  if (typeof place === 'string') return esc(place);
  if (place.ui) return ui(place.ui);
  if (place.keys) return kbd(place.keys.split('+'));
  throw new Error(`unknown place ${JSON.stringify(place)}`);
}

function preferencesTable(id) {
  const data = loadData('preferences/defaults.data.js');
  const group = PREFERENCE_GROUPS.find((g) => g.id === id);
  if (!group) throw new Error(`no preference group "${id}"`);
  const out = [
    '<table>',
    `<caption class="sr-only">${esc(group.title)}</caption>`,
    '<thead><tr><th>Preference</th><th>Where you change it</th><th>What it does</th><th>Default</th></tr></thead>',
    '<tbody>',
  ];
  for (const preference of PREFERENCES.filter((p) => p.group === id)) {
    const where = preference.where.map(whereHtml).join('<br>');
    const page = preference.page ? link(preference.page) : '';
    out.push(
      `<tr><td>${preference.plainLabel ? esc(preference.label) : ui(preference.label)}</td><td>${where}</td><td>${rich(preference.what)}${page ? `<br>See ${page}.` : ''}</td><td>${esc(preference.default(data))}</td></tr>`,
    );
  }
  out.push('</tbody>', '</table>');
  return out.join('\n');
}

// ---- The pages -------------------------------------------------------------------------------

function tableHtml(name) {
  if (name === 'shortcuts') return shortcutsTable();
  const [kind, id] = name.split(':');
  if (kind === 'menu') return menuBarTable(id);
  if (kind === 'context') return contextTable(id);
  if (kind === 'preferences') return preferencesTable(id);
  throw new Error(`unknown table ${name}`);
}

const begin = (name) => `<!-- reference-table:${name} begin (made by tools/reference-tables.mjs; do not edit) -->`;
const end = (name) => `<!-- reference-table:${name} end -->`;

/** What changed between two versions of a page, as the lines that only one of them has (rows of
 * a table are one line each, so an inserted row does not shift the rest). */
function changes(before, after, limit = 12) {
  const count = (lines) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map());
  const left = count(before.split('\n'));
  const right = count(after.split('\n'));
  const take = (from, other) => {
    const out = [];
    for (const [line, n] of from) {
      for (let i = other.get(line) ?? 0; i < n; i += 1) out.push(line.length > 170 ? `${line.slice(0, 167)}…` : line);
    }
    return out;
  };
  const gone = take(left, right);
  const added = take(right, left);
  return [
    ...gone.slice(0, limit).map((line) => `    - ${line}`),
    ...added.slice(0, limit).map((line) => `    + ${line}`),
    ...(gone.length + added.length > 2 * limit ? [`    … ${gone.length} lines go, ${added.length} come`] : []),
  ];
}

const USAGE = `usage: node docs/web/tools/reference-tables.mjs [--check] [--strict] [--web DIR]
  (no option)  rewrite the tables of reference/shortcuts, reference/menus and reference/preferences
  --check      write nothing; say what would change; exit 1 when a page is out of date
  --strict     a page that a table links to and that is still a stub is a problem, not a warning
  --web DIR    work on the docs/web tree DIR (a copy) instead of this checkout's`;

function main() {
  const args = ARGS.filter((arg, index) => !(index === webOption || index === webOption + 1) || webOption < 0);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }
  for (const arg of args) {
    if (!['--check', '--strict'].includes(arg)) {
      console.error(`reference-tables: unknown option ${arg}\n${USAGE}`);
      process.exit(2);
    }
  }
  if (webOption >= 0 && !existsSync(join(WEB, 'reference'))) {
    console.error(`reference-tables: ${WEB} is not a docs/web tree (it has no reference/ folder)`);
    process.exit(2);
  }
  const check = args.includes('--check');
  const strict = args.includes('--strict');
  const writes = [];
  for (const [page, tables] of Object.entries(PAGES)) {
    const path = join(WEB, `${page}.html`);
    if (!existsSync(path)) {
      problem(`${page}.html does not exist`);
      continue;
    }
    let html = readFileSync(path, 'utf8');
    // A page that is still a stub has no tables to make.
    if (metaContent(html, 'mfe:status') === 'stub') continue;
    const original = html;
    for (const name of tables) {
      const pattern = new RegExp(`<!-- reference-table:${name} begin[^>]*-->[\\s\\S]*?<!-- reference-table:${name} end -->`);
      if (!pattern.test(html)) {
        problem(`${page}.html has no markers for the table "${name}"`);
        continue;
      }
      const table = tableHtml(name);
      html = html.replace(pattern, () => `${begin(name)}\n${table}\n${end(name)}`);
    }
    for (const match of html.matchAll(/<!-- reference-table:([^ ]+) begin/g)) {
      if (!tables.includes(match[1])) problem(`${page}.html has markers for "${match[1]}", which this tool does not make`);
    }
    if (html !== original) writes.push({ path, html, page, original });
  }
  for (const testId of Object.keys(MENU_MAC_KEYS)) {
    if (!MAC_KEYS_USED.has(testId)) problem(`MENU_MAC_KEYS has "${testId}", which is no entry of the menu bar`);
  }
  if (strict && stubs.size > 0) {
    problem(`${stubs.size} linked pages are still stubs, so their names are not final: ${[...stubs].join(', ')}`);
  }
  if (problems.length > 0) {
    console.error(`reference-tables: ${problems.length} problem${problems.length === 1 ? '' : 's'} (nothing was written):`);
    for (const message of [...new Set(problems)]) console.error(`  - ${message}`);
    process.exit(1);
  }
  if (!strict && stubs.size > 0) {
    console.error(
      `reference-tables: warning: ${stubs.size} linked page${stubs.size === 1 ? ' is' : 's are'} still stub${stubs.size === 1 ? '' : 's'} here, so ` +
        `${stubs.size === 1 ? 'its name is' : 'their names are'} not final (run it again once every page is merged, with --strict):\n  ${[...stubs].join(', ')}`,
    );
  }
  if (check) {
    for (const { page, html, original } of writes) {
      console.error(`reference-tables: ${page}.html is out of date:`);
      for (const line of changes(original, html)) console.error(line);
    }
    if (writes.length > 0) process.exit(1);
    console.log('reference-tables: every table is up to date');
    return;
  }
  for (const { path, html, page, original } of writes) {
    writeFileSync(path, html);
    const lines = changes(original, html, 1000);
    console.log(
      `reference-tables: wrote the tables of ${page}.html (${lines.length > 0 ? `${lines.length} lines changed` : 'rows in another order'})`,
    );
  }
  if (writes.length === 0) console.log('reference-tables: nothing to change');
  console.log(`reference-tables: ${pageCache.size} pages linked, with the names they have now`);
}

main();
