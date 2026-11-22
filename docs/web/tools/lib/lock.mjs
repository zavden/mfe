/* A few heavy runs at a time on the machine. Every tool of the documentation that starts Chrome,
 * the app's dev server or Manim does it inside `withMachineLock`, so several people or agents
 * working on the documentation at once (each in a checkout of their own) take turns instead of
 * heating the machine together. The machine has a few slots (three by default; `MFE_DOCS_SLOTS`,
 * or the file `mfe-docs-machine.slots` of the temporary folder, sets 1 to 6): a run takes a free
 * one, or waits for one — in the order of arrival: a run that waits leaves a ticket in a queue
 * folder, and only the oldest ticket may take the slot that frees. Each slot has its own dev
 * server port (`DOCS_APP_PORT` + slot). A slot is a folder in the system's temporary directory,
 * made atomically; it names its owner, and an owner that died leaves a slot that the next tool
 * takes over (stopping the dev server it may have left behind); the ticket of a run that died is
 * thrown away by the others. Inside a run, a nested `withMachineLock` of the same process runs in
 * the slot it already holds. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_SLOTS = 6;
const DEFAULT_SLOTS = 3;

/** A file of the temporary folder with the number of slots for every run on the machine, read
 * again at each try: whoever watches the temperature while many agents work can open or close
 * slots without touching their checkouts. `MFE_DOCS_SLOTS` wins over it. */
const SLOTS_FILE = join(tmpdir(), 'mfe-docs-machine.slots');

function slotsOfTheMachine() {
  try {
    return readFileSync(SLOTS_FILE, 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

/** How many heavy runs may go on at once on this machine. */
export function slotCount() {
  const wanted = Number(process.env.MFE_DOCS_SLOTS ?? slotsOfTheMachine() ?? DEFAULT_SLOTS);
  return Number.isInteger(wanted) && wanted >= 1 ? Math.min(wanted, MAX_SLOTS) : DEFAULT_SLOTS;
}

/** The folder of the tickets of the runs that wait for a slot. */
const QUEUE_DIR = join(tmpdir(), 'mfe-docs-machine.queue');

/** The folder of a slot; the first keeps the name the single lock had. */
function slotDir(slot) {
  return join(tmpdir(), slot === 0 ? 'mfe-docs-machine.lock' : `mfe-docs-machine.${slot + 1}.lock`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The slot this process holds, while it holds one. */
let held = null;

/** The slot this process runs in (0, 1…), or null outside `withMachineLock`. */
export function currentSlot() {
  return held;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Stops a process and its group (or, on Windows, its tree). */
export function killTree(pid) {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else process.kill(-pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

/** A slot whose owner is gone: stop what it left running, then free it. */
function clearStale(slot) {
  const server = readJson(join(slotDir(slot), 'server.json'));
  if (server?.pid) killTree(server.pid);
  rmSync(slotDir(slot), { recursive: true, force: true });
}

/** Records the dev server a run started, so that a run after a crash can stop it. */
export function recordServer(pid) {
  if (held === null) throw new Error('recordServer outside withMachineLock');
  writeFileSync(join(slotDir(held), 'server.json'), JSON.stringify({ pid }));
}

/** Tries to take one slot; returns it, or null when every slot is busy (then `busy` lists their
 * owners). Clears the slots of owners that are gone. */
function tryTake(busy) {
  for (let slot = 0; slot < slotCount(); slot += 1) {
    const dir = slotDir(slot);
    try {
      mkdirSync(dir);
      return slot;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const owner = readJson(join(dir, 'owner.json'));
    if (owner && !alive(owner.pid)) {
      clearStale(slot);
      try {
        mkdirSync(dir);
        return slot;
      } catch {
        // taken meanwhile by another run
      }
    } else if (!owner) {
      // Made a moment ago and not yet named, or left unnamed by a run that died at once.
      try {
        if (Date.now() - statSync(dir).mtimeMs > 30_000) clearStale(slot);
      } catch {
        // gone meanwhile
      }
    } else busy.push(owner);
  }
  return null;
}

/** The tickets of the runs that wait, the oldest first (a ticket's name starts with its time of
 * arrival). Throws away the tickets of processes that are gone. */
function waiting() {
  let names = [];
  try {
    names = readdirSync(QUEUE_DIR).filter((name) => /^\d{15}-\d+-\d+\.json$/.test(name));
  } catch {
    return [];
  }
  return names.sort().filter((name) => {
    if (alive(Number(name.split('-')[1]))) return true;
    rmSync(join(QUEUE_DIR, name), { force: true });
    return false;
  });
}

/** The owners of the slots taken now. */
function owners() {
  const found = [];
  for (let slot = 0; slot < slotCount(); slot += 1) {
    const owner = readJson(join(slotDir(slot), 'owner.json'));
    if (owner) found.push(owner);
  }
  return found;
}

let tickets = 0;

/** Runs `fn` holding a slot of the machine; while every slot is busy it waits its turn (saying
 * its place in the queue and for whom it waits). */
export async function withMachineLock(label, fn, { log = console.error, pollMs = 2_000 } = {}) {
  if (held !== null) return fn();
  const since = new Date().toISOString();
  tickets += 1;
  // `MFE_DOCS_FIRST=1` puts a run at the head of the queue: for whoever merges the work of the
  // others, whose checks would otherwise wait behind every capture.
  const arrived = process.env.MFE_DOCS_FIRST ? 0 : Date.now();
  const ticket = `${String(arrived).padStart(15, '0')}-${process.pid}-${tickets}.json`;
  const ticketFile = join(QUEUE_DIR, ticket);
  const queueUp = () => {
    mkdirSync(QUEUE_DIR, { recursive: true });
    writeFileSync(ticketFile, JSON.stringify({ pid: process.pid, label, since }));
  };
  const leaveQueue = () => rmSync(ticketFile, { force: true });
  let dir = null;
  const release = () => {
    leaveQueue();
    if (dir === null) return;
    if (readJson(join(dir, 'owner.json'))?.pid === process.pid) {
      rmSync(dir, { recursive: true, force: true });
    }
    held = null;
  };
  const onSignal = () => {
    // Ended by a signal, the run never reaches the code that stops its dev server: stop it here.
    const server = dir === null ? null : readJson(join(dir, 'server.json'));
    if (server?.pid) killTree(server.pid);
    release();
    process.exit(130);
  };
  process.once('exit', release);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    queueUp();
    let announced = '';
    for (;;) {
      // Another call of this process took a slot meanwhile: run in it.
      if (held !== null) {
        leaveQueue();
        return await fn();
      }
      const queue = waiting();
      const place = queue.indexOf(ticket);
      if (place === -1) queueUp(); // the temporary folder was cleaned under the run
      const busy = [];
      // Only the run that has waited longest takes a slot: the others would overtake it.
      const slot = place === 0 ? tryTake(busy) : null;
      if (slot !== null) {
        dir = slotDir(slot);
        writeFileSync(
          join(dir, 'owner.json'),
          JSON.stringify({ pid: process.pid, label, since: new Date().toISOString() }),
        );
        held = slot;
        leaveQueue();
        break;
      }
      const who = (place === 0 ? busy : owners())
        .map((owner) => `${owner.label} (pid ${owner.pid})`)
        .join(', ');
      const ahead = place > 0 ? `, ${place} ahead in the queue` : '';
      const message = `waiting for a free slot${ahead}; busy: ${who || 'a run that is starting'}…`;
      if (message !== announced) {
        log(message);
        announced = message;
      }
      await sleep(pollMs);
    }
    return await fn();
  } finally {
    release();
    process.off('exit', release);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}
