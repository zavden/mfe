// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  bandCovers,
  clampZoom,
  lowestZoom,
  timelineExtent,
  wholeZoom,
  labelBand,
  majorTicks,
  MAX_MAJOR_TICKS,
  MAX_OWN_DT,
  MAX_ZOOM,
  MIN_OWN_DT,
  MIN_TICK_SPACING,
  MIN_ZOOM,
  nearestTick,
  ownDtLabel,
  rulerLabel,
  rulerScale,
  smallTicks,
  steppedDt,
  tickLabel,
  visibleStretch,
} from '../ruler';

describe('ruler', () => {
  it('spaces labels at least ~90 px apart', () => {
    for (const px of [8, 20, 40, 80, 160, 640, 2000]) {
      const { major } = rulerScale(px, 60);
      expect(major * px).toBeGreaterThanOrEqual(90 - 1e-9);
    }
    expect(rulerScale(80, 60)).toEqual({ major: 2, minor: 0.5 });
    expect(rulerScale(800, 60)).toMatchObject({ major: 0.2 });
  });

  it('puts a time on the small ticks, from the start to the last tick before the end', () => {
    expect(nearestTick(1.3, 0.5, 10)).toBe(1.5);
    expect(nearestTick(1.24, 0.5, 10)).toBe(1);
    expect(nearestTick(1.25, 0.5, 10)).toBe(1.5);
    expect(nearestTick(-0.4, 0.5, 10)).toBe(0);
    // The end is a tick: the playhead reaches it.
    expect(nearestTick(9.9, 0.5, 10)).toBe(10);
    expect(nearestTick(12, 0.5, 10)).toBe(10);
    // The end is on no tick: the last one before it.
    expect(nearestTick(7.3, 0.5, 7.3)).toBe(7);
    expect(nearestTick(7.3, 0.2, 7.3)).toBeCloseTo(7.2, 9);
    // A scene shorter than a tick has the start alone.
    expect(nearestTick(0.3, 0.5, 0.4)).toBe(0);
    // A tick on every frame: the frames.
    expect(nearestTick(0.26, 1 / 60, 10)).toBeCloseTo(16 / 60, 9);
  });

  it('says the time between two small ticks: seconds, a frame as its fraction, minutes', () => {
    expect(tickLabel(rulerScale(80, 60).minor, 60)).toBe('0.5 s');
    expect(tickLabel(rulerScale(2400, 60).minor, 60)).toBe('0.01 s');
    expect(tickLabel(rulerScale(8, 60).minor, 60)).toBe('5 s');
    expect(tickLabel(0.2, 60)).toBe('0.2 s');
    // A tick on every frame: the frame, not a rounded decimal — unless it is a plain one.
    expect(tickLabel(rulerScale(600, 60).minor, 60)).toBe('1/60 s');
    expect(tickLabel(1 / 24, 24)).toBe('1/24 s');
    expect(tickLabel(1 / 50, 50)).toBe('0.02 s');
    expect(tickLabel(1 / 8, 8)).toBe('0.125 s');
    // From a minute up, in minutes.
    expect(tickLabel(60, 60)).toBe('1 min');
    expect(tickLabel(120, 60)).toBe('2 min');
    expect(tickLabel(600, 60)).toBe('10 min');
    expect(tickLabel(30, 60)).toBe('30 s');
  });

  it('grids on frames when they are wide enough', () => {
    expect(rulerScale(80, 60).minor).toBe(0.5); // a frame is 1.3 px
    expect(rulerScale(600, 60).minor).toBeCloseTo(1 / 60, 9); // 10 px per frame
    expect(rulerScale(600, 30).minor).toBeCloseTo(1 / 30, 9);
  });

  it('labels seconds and minutes', () => {
    expect(rulerLabel(4, 2)).toBe('4s');
    expect(rulerLabel(0.5, 0.5)).toBe('0.5s');
    expect(rulerLabel(0.05, 0.05)).toBe('0.05s');
    expect(rulerLabel(75, 15)).toBe('1:15');
    expect(rulerLabel(120, 60)).toBe('2:00');
  });

  it('lists ticks on multiples of the major step', () => {
    expect(majorTicks(0, 7, { major: 2, minor: 0.5 })).toEqual([0, 2, 4, 6, 8]);
    expect(majorTicks(3, 7, { major: 2, minor: 0.5 })).toEqual([2, 4, 6, 8]);
  });

  it('never lists more ticks than a ruler can label, however long the stretch', () => {
    const scale = rulerScale(8, 30);
    // 10,000 hours, a scene 1e300 s long as a file can bring it, and no end at all.
    for (const to of [36_000_000, 1e300, Infinity]) {
      const ticks = majorTicks(0, to, scale);
      expect(ticks).toHaveLength(MAX_MAJOR_TICKS + 1);
      expect(ticks[0]).toBe(0);
      expect(ticks[1]).toBe(scale.major);
    }
    // From a time so far that a step no longer changes it: still a list that ends.
    expect(majorTicks(1e300, Infinity, scale).length).toBeLessThanOrEqual(MAX_MAJOR_TICKS + 1);
    // What a view shows is far under the limit.
    expect(majorTicks(0, 3600, scale).length).toBeLessThan(MAX_MAJOR_TICKS);
  });

  it('clamps the zoom', () => {
    expect(clampZoom(1)).toBe(MIN_ZOOM);
    expect(clampZoom(1e6)).toBe(MAX_ZOOM);
  });

  it('lays out the scene with room after its end, and never less than twelve seconds', () => {
    expect(timelineExtent(0, 0)).toBe(12);
    expect(timelineExtent(4, 4)).toBe(12);
    expect(timelineExtent(10, 10)).toBe(16);
    // A fixed duration shorter than what the clips reach: as far as they reach.
    expect(timelineExtent(10, 30)).toBe(36);
    expect(timelineExtent(3600, 200)).toBe(3606);
  });

  it('shows the whole timeline at the zoom where nothing is left to scroll', () => {
    // 16 s in 1220 px: all of it, half a pixel to spare.
    const zoom = wholeZoom(16, 1220);
    expect(zoom * 16).toBeLessThanOrEqual(1220);
    expect(zoom * 16).toBeGreaterThan(1219);
    // Under the lowest zoom of a short scene too: a long timeline still fits whole, and that is
    // where its zoom stops, exactly.
    for (const seconds of [156, 300, 3606]) {
      const whole = wholeZoom(seconds, 1220);
      expect(whole * seconds).toBeLessThanOrEqual(1220);
      expect(whole * seconds).toBeGreaterThan(1219);
      expect(whole).toBeLessThan(MIN_ZOOM);
      expect(lowestZoom(seconds, 1220)).toBe(whole);
    }
    // A short one keeps the lowest zoom it always had, past the point where it is all in view.
    expect(wholeZoom(16, 1220)).toBeGreaterThan(MIN_ZOOM);
    expect(lowestZoom(16, 1220)).toBe(MIN_ZOOM);
    expect(lowestZoom(0, 1220)).toBe(MIN_ZOOM);
    // Nothing to measure yet: the default.
    expect(wholeZoom(0, 800)).toBe(80);
    expect(wholeZoom(16, 0)).toBe(80);
  });
});

describe('a dt of one’s own (D181)', () => {
  it('steps from the zoom’s dt to the tenth of a second after it or before it', () => {
    // [the zoom's dt, what − gives, what + gives]
    const cases: [number, number | null, number | null][] = [
      [0.01, null, 0.1],
      [0.02, null, 0.1],
      [1 / 60, null, 0.1],
      [0.05, null, 0.1],
      [0.1, null, 0.2],
      [0.2, 0.1, 0.3],
      [0.5, 0.4, 0.6],
      [1, 0.9, 1.1],
      [5, 4.9, 5.1],
      [600, 599.9, 600.1],
    ];
    for (const [dt, less, more] of cases) {
      expect([dt, steppedDt(dt, -1), steppedDt(dt, 1)]).toEqual([dt, less, more]);
    }
    // A frame of a slow project is between two tenths: the one before it and the one after.
    expect(steppedDt(1 / 8, -1)).toBe(0.1);
    expect(steppedDt(1 / 8, 1)).toBe(0.2);
    expect(steppedDt(1 / 24, 1)).toBe(0.1);
  });

  it('steps a dt of its own by a tenth, each one the tenth itself', () => {
    const walk = (from: number, direction: -1 | 1, steps: number) => {
      const seen: number[] = [];
      let dt: number | null = from;
      for (let i = 0; i < steps; i += 1) {
        dt = steppedDt(dt!, direction);
        seen.push(dt!);
      }
      return seen;
    };
    // `toEqual` tells 0.30000000000000004 from 0.3.
    expect(walk(0.1, 1, 12)).toEqual([0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3]);
    expect(walk(1.3, -1, 12)).toEqual([1.2, 1.1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]);
    expect(walk(12.2, 1, 3)).toEqual([12.3, 12.4, 12.5]);
    // A time a hair off a tenth, as sums of floats leave it, counts as that tenth.
    expect(steppedDt(0.1 + 0.2, 1)).toBe(0.4);
    expect(steppedDt(0.7 - 1e-12, -1)).toBe(0.6);
  });

  it('stops at a tenth of a second and at an hour', () => {
    expect(MIN_OWN_DT).toBe(0.1);
    expect(MAX_OWN_DT).toBe(3600);
    expect(steppedDt(MIN_OWN_DT, -1)).toBeNull();
    expect(steppedDt(MIN_OWN_DT, 1)).toBe(0.2);
    expect(steppedDt(MAX_OWN_DT, 1)).toBeNull();
    expect(steppedDt(MAX_OWN_DT, -1)).toBe(3599.9);
    expect(steppedDt(3599.9, 1)).toBe(3600);
    // The zoom's own is never longer than ten minutes: + always has somewhere to go from it.
    expect(rulerScale(0.001, 60).minor).toBe(600);
  });

  it('says a dt of its own in seconds, to the tenth, minutes and all', () => {
    expect(ownDtLabel(0.3)).toBe('0.3 s');
    expect(ownDtLabel(1)).toBe('1 s');
    expect(ownDtLabel(12.3)).toBe('12.3 s');
    // Minutes would round 60.1 s and 75.5 s away ("1 min", "1.26 min").
    expect(ownDtLabel(60.1)).toBe('60.1 s');
    expect(ownDtLabel(75.5)).toBe('75.5 s');
    expect(ownDtLabel(3600)).toBe('3600 s');
  });

  it('draws the small ticks dt apart, and none closer together than 4 px', () => {
    const period = (image: string) => /transparent ([\d.]+)px\)$/.exec(image)?.[1];
    expect(period(smallTicks(0.5, 80))).toBe('40');
    expect(period(smallTicks(0.3, 80))).toBe('24');
    expect(period(smallTicks(1 / 60, 600))).toBe('10');
    expect(MIN_TICK_SPACING).toBe(4);
    expect(period(smallTicks(0.1, 40))).toBe('4');
    expect(smallTicks(0.1, 39)).toBe('none');
    expect(smallTicks(0.1, MIN_ZOOM)).toBe('none');
    // The zoom's own dt is drawn at every zoom down to 0.025 px/s, the lowest of a timeline
    // twelve hours long.
    for (const px of [0.025, 0.3, MIN_ZOOM, 20, 80, 600, MAX_ZOOM]) {
      expect(smallTicks(rulerScale(px, 60).minor, px)).not.toBe('none');
    }
  });
});

describe('visible stretch and label band', () => {
  it('reads the shown time from the scroll position, past the header column', () => {
    // 1200 px wide at 2400 px/s, scrolled 12 000 px, a 168 px header: 4.93 s to 5.43 s.
    const visible = visibleStretch(12_000, 1200, 168, 2400);
    expect(visible.from).toBeCloseTo((12_000 - 168) / 2400, 6);
    expect(visible.to).toBeCloseTo(visible.from + 0.5, 6);
  });

  it('widens the band by a viewport on each side, within the project', () => {
    expect(labelBand({ from: 10, to: 12 }, 3600)).toEqual({ from: 8, to: 14 });
    expect(labelBand({ from: -0.5, to: 1.5 }, 3600)).toEqual({ from: 0, to: 3.5 });
    expect(labelBand({ from: 3598, to: 3601 }, 3600)).toEqual({ from: 3595, to: 3600 });
  });

  it('keeps the band while the view stays inside it', () => {
    const band = labelBand({ from: 10, to: 12 }, 3600);
    expect(bandCovers(band, { from: 10, to: 12 }, 3600)).toBe(true);
    expect(bandCovers(band, { from: 8, to: 10 }, 3600)).toBe(true);
    expect(bandCovers(band, { from: 7.9, to: 9.9 }, 3600)).toBe(false);
    expect(bandCovers(band, { from: 12.5, to: 14.5 }, 3600)).toBe(false);
    // The edges of the project count as covered.
    expect(bandCovers({ from: 0, to: 6 }, { from: -1, to: 5 }, 3600)).toBe(true);
    expect(bandCovers({ from: 3590, to: 3600 }, { from: 3595, to: 3605 }, 3600)).toBe(true);
  });

  it('bounds the labels of an hour at the closest zoom to a few viewports', () => {
    const scale = rulerScale(MAX_ZOOM, 60);
    // An hour has 72,000 ticks to label there (one every 0.05 s): the list stops at its limit.
    expect(3606 / scale.major).toBeGreaterThan(70_000);
    const all = majorTicks(0, 3606, scale).length;
    const band = labelBand(visibleStretch(1_000_000, 1300, 168, MAX_ZOOM), 3606);
    const some = majorTicks(band.from, band.to, scale).length;
    expect(all).toBe(MAX_MAJOR_TICKS + 1);
    expect(some).toBeLessThan(60);
  });
});
