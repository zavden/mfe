/* The CPU temperature guard of the documentation's tools. A run that starts Chrome, a dev server
 * or Manim heats the machine: from 85 °C a tool waits until the CPU is back under 80 °C before
 * it goes on, and at 95 °C it stops everything it started at once. Only Linux reports the
 * temperature here (the `k10temp` sensor of an AMD CPU, through `sensors` or hwmon); elsewhere
 * the guard does nothing. */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

export const WARN_AT = 85;
export const STOP_AT = 95;
export const RESUME_UNDER = 80;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The CPU temperature in °C, or null where it cannot be read. */
export function readCpuTemperature() {
  if (process.platform !== 'linux') return null;
  const sensors = spawnSync('sensors', [], { encoding: 'utf8' });
  if (sensors.status === 0) {
    const match = /Tctl:\s*\+?([\d.]+)/.exec(sensors.stdout);
    if (match) return Number(match[1]);
  }
  try {
    for (const dir of readdirSync('/sys/class/hwmon')) {
      const base = `/sys/class/hwmon/${dir}`;
      if (readFileSync(`${base}/name`, 'utf8').trim() !== 'k10temp') continue;
      return Number(readFileSync(`${base}/temp1_input`, 'utf8')) / 1000;
    }
  } catch {
    // no hwmon
  }
  return null;
}

/** Waits while the CPU is at or above `WARN_AT` until it is under `RESUME_UNDER`; throws at
 * `STOP_AT`. Returns the temperature it let the run go on at (null when unknown). */
export async function waitUntilCool(log = console.error) {
  let celsius = readCpuTemperature();
  if (celsius === null) return null;
  if (celsius >= STOP_AT) throw new Error(`CPU at ${celsius} °C (≥ ${STOP_AT} °C): not starting`);
  if (celsius < WARN_AT) return celsius;
  log(`CPU at ${celsius} °C: waiting until it is under ${RESUME_UNDER} °C`);
  while (celsius !== null && celsius >= RESUME_UNDER) {
    if (celsius >= STOP_AT) throw new Error(`CPU at ${celsius} °C (≥ ${STOP_AT} °C): stopping`);
    await sleep(10_000);
    celsius = readCpuTemperature();
  }
  return celsius;
}

/** Watches the temperature every few seconds while a run goes on and calls `onCritical` once
 * when it reaches `STOP_AT`. Returns the function that stops watching, and a read of the
 * highest temperature seen. */
export function watchTemperature(onCritical, { everyMs = 4_000 } = {}) {
  let highest = readCpuTemperature();
  let fired = false;
  const timer = setInterval(() => {
    const celsius = readCpuTemperature();
    if (celsius === null) return;
    if (highest === null || celsius > highest) highest = celsius;
    if (!fired && celsius >= STOP_AT) {
      fired = true;
      onCritical(celsius);
    }
  }, everyMs);
  timer.unref();
  return { stop: () => clearInterval(timer), highest: () => highest };
}
