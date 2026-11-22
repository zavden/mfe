/* The notes of a deck, for whoever presents it: the note of the pause it stands at or last passed,
 * and the comments its author left on the slide it is on, in the order of their instants. Hidden
 * until asked for (the S key, or the bar's Notes button). The words are worked out from the
 * deck's public object (`notesAt`, pure); `createNotes` keeps a region of the page with them. */
import { formatSeconds } from '../embed/clock';
import { stopsOf } from '../model';
import type { Deck } from './deck';
import { skipsWait, slideAt } from './slideClock';

/** Times closer than this are one (the deck's own tolerance). */
const EPSILON = 1e-6;

export interface NoteItem {
  kind: 'pause' | 'comment';
  time: number;
  text: string;
  /** A pause that skips its wait: its label says so. */
  skipsWait?: true;
}

type Where = Pick<Deck, 'pauses' | 'comments' | 'duration' | 'time' | 'slide'>;

/** The notes of where `deck` stands. A comment is on the slide its instant is on — one at the
 * instant of a pause is read before the scene stops there, as the editor orders them —; the pause
 * is the last one at or before the deck's time that has a note. */
export function notesAt(deck: Where): NoteItem[] {
  const stops = stopsOf(
    deck.duration,
    deck.pauses.map((pause) => pause.time),
  );
  const items: NoteItem[] = deck.comments
    .filter((comment) => slideAt(stops, comment.time) === deck.slide)
    .map((comment) => ({ kind: 'comment', time: comment.time, text: comment.text }));
  let pause: NoteItem | null = null;
  for (const candidate of deck.pauses) {
    if (candidate.time > deck.time + EPSILON) break;
    pause = { kind: 'pause', time: candidate.time, text: candidate.note };
    if (skipsWait(candidate)) pause.skipsWait = true;
  }
  if (pause && pause.text.trim() !== '') items.push(pause);
  // By instant; a comment before the pause it shares one with.
  return items.sort(
    (a, b) => a.time - b.time || (a.kind === b.kind ? 0 : a.kind === 'comment' ? -1 : 1),
  );
}

/** Whether a deck has any words for its notes at all. */
export function hasNotes(deck: Pick<Deck, 'pauses' | 'comments'>): boolean {
  return deck.comments.length > 0 || deck.pauses.some((pause) => pause.note.trim() !== '');
}

export interface Notes {
  readonly element: HTMLDivElement;
  readonly open: boolean;
  /** Shows them, or hides them. */
  show(open: boolean): void;
  /** Says where the deck stands now (only while they show). */
  update(): void;
}

/** The notes region of `deck`, hidden:
 *
 *   <div class="mfe-notes" role="region" aria-label="Notes" hidden>
 *     <p class="mfe-notes-heading">Slide 2 of 3</p>
 *     <ul class="mfe-notes-list">
 *       <li class="mfe-note" data-kind="comment">
 *         <span class="mfe-note-label">Comment · 1.25 s</span>
 *         <span class="mfe-note-text">…</span>
 *       </li>
 *       <li class="mfe-note" data-kind="pause" data-skip-wait>
 *         <span class="mfe-note-label">Pause · 1.50 s · skips its wait</span>
 *         <span class="mfe-note-text">…</span>
 *       </li>
 *     </ul>
 *     <p class="mfe-notes-empty">No notes on this slide.</p>
 *   </div> */
export function createNotes(deck: Deck, doc: Document): Notes {
  const element = doc.createElement('div');
  element.className = 'mfe-notes';
  element.setAttribute('role', 'region');
  element.setAttribute('aria-label', 'Notes');
  element.hidden = true;
  const heading = doc.createElement('p');
  heading.className = 'mfe-notes-heading';
  const list = doc.createElement('ul');
  list.className = 'mfe-notes-list';
  const empty = doc.createElement('p');
  empty.className = 'mfe-notes-empty';
  empty.textContent = 'No notes on this slide.';
  element.append(heading, list, empty);

  let shown = '';
  const update = () => {
    if (element.hidden) return;
    const items = notesAt(deck);
    const key = JSON.stringify([deck.slide, items]);
    if (key === shown) return;
    shown = key;
    heading.textContent = deck.slides > 1 ? `Slide ${deck.slide + 1} of ${deck.slides}` : 'Notes';
    list.replaceChildren(
      ...items.map((item) => {
        const row = doc.createElement('li');
        row.className = 'mfe-note';
        row.setAttribute('data-kind', item.kind);
        if (item.skipsWait) row.setAttribute('data-skip-wait', '');
        const label = doc.createElement('span');
        label.className = 'mfe-note-label';
        label.textContent =
          `${item.kind === 'pause' ? 'Pause' : 'Comment'} · ${formatSeconds(item.time)} s` +
          (item.skipsWait ? ' · skips its wait' : '');
        const text = doc.createElement('span');
        text.className = 'mfe-note-text';
        text.textContent = item.text;
        row.append(label, text);
        return row;
      }),
    );
    list.hidden = items.length === 0;
    empty.hidden = items.length > 0;
  };

  return {
    element,
    get open() {
      return !element.hidden;
    },
    show(open) {
      element.hidden = !open;
      if (open) update();
    },
    update,
  };
}
