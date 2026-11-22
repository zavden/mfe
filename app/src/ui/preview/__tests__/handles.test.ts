// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toPixel, toScene, type Camera, type Surface } from '../../../render';
import {
  multiply,
  rectContour,
  rotate,
  transformContour,
  translate,
  type Box,
  type Contour,
  type Vec2,
} from '../../../geom';
import {
  advanceRotation,
  angleAround,
  BOX_PAD,
  beginRotation,
  handleCursor,
  handleGeometry,
  hitHandle,
  MIN_SCALE,
  orientedBox,
  ROTATE_CURSOR,
  ROTATE_OFFSET,
  rotationFromDrag,
  rotationReadout,
  scaleFromDrag,
  SCALE_SNAP,
  scaleReadout,
  shortestAngle,
  snapAngle,
  snappedScale,
  snapScale,
  turnedBox,
  type OrientedBox,
} from '../handles';

const local: Box = { minX: -2, minY: -0.5, maxX: 2, maxY: 0.5 };
const still = {
  position: [0, 0] as Vec2,
  rotation: 0,
  scale: 1,
  flipX: false,
  flipY: false,
};

const near = (a: Vec2, b: Vec2, digits = 6) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};

describe('orientedBox', () => {
  it('is the local box under scale, rotation and position', () => {
    const box = orientedBox(local, { ...still, position: [1, 2], scale: 2, rotation: 30 });
    expect(box).toMatchObject({ center: [1, 2], rotation: 30, halfWidth: 4, halfHeight: 1 });
  });

  it('follows an off-centre local box through flips and rotation', () => {
    const off: Box = { minX: 0, minY: 0, maxX: 2, maxY: 2 }; // centre (1, 1)
    near(orientedBox(off, still).center, [1, 1]);
    near(orientedBox(off, { ...still, flipX: true }).center, [-1, 1]);
    near(orientedBox(off, { ...still, rotation: 90 }).center, [-1, 1]); // (1, 1) turned CCW
    near(orientedBox(off, { ...still, scale: 3, position: [5, 0] }).center, [8, 3]);
  });
});

describe('turnedBox', () => {
  /** The corners of a 4 × 1 rectangle centred on (1, 2), turned by `degrees` about its centre. */
  const turnedRect = (degrees: number): Contour[] => {
    const rect = rectContour({ minX: -2, minY: -0.5, maxX: 2, maxY: 0.5 });
    return [transformContour(multiply(translate(1, 2), rotate(degrees)), rect)];
  };

  it('frames glyphs turned by the same angle with a box turned like them', () => {
    const box = turnedBox(turnedRect(30), 30);
    expect(box.rotation).toBe(30);
    expect(box.center[0]).toBeCloseTo(1, 9);
    expect(box.center[1]).toBeCloseTo(2, 9);
    expect(box.halfWidth).toBeCloseTo(2, 9);
    expect(box.halfHeight).toBeCloseTo(0.5, 9);
  });

  it('is the upright box at angle 0', () => {
    const box = turnedBox(turnedRect(30), 0);
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    expect(box.rotation).toBe(0);
    expect(box.halfWidth).toBeCloseTo(2 * c + 0.5 * s, 9);
    expect(box.halfHeight).toBeCloseTo(2 * s + 0.5 * c, 9);
    expect(box.center[0]).toBeCloseTo(1, 9);
  });
});

describe('handleGeometry', () => {
  const box: OrientedBox = { center: [1, 1], rotation: 0, halfWidth: 2, halfHeight: 1 };

  it('puts the corners on the padded box, y up, and the rotation handle above the top edge', () => {
    const unit = 0.01; // 1 CSS px = 0.01 scene units
    const pad = BOX_PAD * unit;
    const g = handleGeometry(box, unit);
    near(g.corners.nw, [1 - 2 - pad, 1 + 1 + pad]);
    near(g.corners.ne, [1 + 2 + pad, 1 + 1 + pad]);
    near(g.corners.se, [1 + 2 + pad, 1 - 1 - pad]);
    near(g.corners.sw, [1 - 2 - pad, 1 - 1 - pad]);
    near(g.stemStart, [1, 1 + 1 + pad]);
    near(g.rotate, [1, 1 + 1 + pad + ROTATE_OFFSET * unit]);
  });

  it('turns with the box', () => {
    const g = handleGeometry({ ...box, rotation: 90 }, 0);
    // Rotated 90° CCW: the old top edge faces left, so the rotation handle is to the left.
    near(g.rotate, [1 - 1, 1]);
    near(g.corners.ne, [1 - 1, 1 + 2]); // (2, 1) turned 90° CCW is (-1, 2)
    near(g.corners.nw, [1 - 1, 1 - 2]); // (-2, 1) turned 90° CCW is (-1, -2)
  });

  it('keeps handle distances constant on screen at any zoom', () => {
    for (const zoom of [0.25, 1, 8]) {
      const unit = 1 / (100 * zoom); // scene units per CSS px at 100·zoom px per unit
      const g = handleGeometry(box, unit);
      const gap = Math.hypot(g.rotate[0] - g.stemStart[0], g.rotate[1] - g.stemStart[1]);
      expect(gap / unit).toBeCloseTo(ROTATE_OFFSET, 6);
      const corner = Math.hypot(g.corners.ne[0] - 3 - 0, 0);
      expect(corner / unit).toBeCloseTo(BOX_PAD, 6); // the padding in pixels
    }
  });
});

describe('hitHandle', () => {
  const box: OrientedBox = { center: [0, 0], rotation: 0, halfWidth: 2, halfHeight: 1 };
  const unit = 0.01;
  const g = handleGeometry(box, unit);

  it('grabs a corner or the rotation handle within the hit radius, in screen pixels', () => {
    expect(hitHandle(g, [g.corners.ne[0] + 5 * unit, g.corners.ne[1] - 5 * unit], unit)).toBe('ne');
    expect(hitHandle(g, g.corners.sw, unit)).toBe('sw');
    expect(hitHandle(g, [g.rotate[0], g.rotate[1] + 6 * unit], unit)).toBe('rotate');
    expect(hitHandle(g, [g.corners.nw[0] - 20 * unit, g.corners.nw[1]], unit)).toBeNull();
    expect(hitHandle(g, [0, 0], unit)).toBeNull();
  });

  it('scales the radius with the zoom: the same pixel distance always hits', () => {
    const zoomedUnit = unit / 10;
    const zoomed = handleGeometry(box, zoomedUnit);
    expect(
      hitHandle(zoomed, [zoomed.corners.se[0] + 8 * zoomedUnit, zoomed.corners.se[1]], zoomedUnit),
    ).toBe('se');
    expect(
      hitHandle(zoomed, [zoomed.corners.se[0] + 12 * zoomedUnit, zoomed.corners.se[1]], zoomedUnit),
    ).toBeNull();
  });

  it('prefers the nearest handle when two are close (a tiny box)', () => {
    const tiny = handleGeometry({ ...box, halfWidth: 0, halfHeight: 0 }, unit);
    const point: Vec2 = [tiny.corners.ne[0] + 2 * unit, tiny.corners.ne[1] + 1 * unit];
    expect(hitHandle(tiny, point, unit)).toBe('ne');
  });
});

describe('cursors', () => {
  it('uses the diagonal the corner points along on screen, whatever the aspect ratio', () => {
    expect(handleCursor('nw', 0)).toBe('nwse-resize');
    expect(handleCursor('se', 0)).toBe('nwse-resize');
    expect(handleCursor('ne', 0)).toBe('nesw-resize');
    expect(handleCursor('sw', 0)).toBe('nesw-resize');
  });

  it('follows the rotation of the box', () => {
    // Turned 45° counter-clockwise, the corners point up, left, down and right.
    expect(handleCursor('ne', 45)).toBe('ns-resize'); // (1, 1) turned: (0, 1.41)
    expect(handleCursor('nw', 45)).toBe('ew-resize'); // (-1, 1) turned: (-1.41, 0)
    expect(handleCursor('ne', 90)).toBe('nwse-resize'); // (1, 1) turned: (-1, 1)
    expect(handleCursor('ne', 180)).toBe('nesw-resize'); // (-1, -1): down-left, "/"
    expect(handleCursor('ne', -90)).toBe('nwse-resize'); // (1, -1) is down-right: "\"
  });

  it('shows a rotation cursor for the rotation handle', () => {
    expect(handleCursor('rotate', 30)).toBe(ROTATE_CURSOR);
    expect(ROTATE_CURSOR).toMatch(/^url\("data:image\/svg\+xml,.*"\) 12 12, grab$/);
  });
});

describe('scaleFromDrag', () => {
  const c: Vec2 = [1, 1];

  it('multiplies the start scale by how much the distance to the centre changed', () => {
    expect(scaleFromDrag(1, c, [3, 1], [5, 1])).toBeCloseTo(2);
    expect(scaleFromDrag(1.5, c, [3, 1], [2, 1])).toBeCloseTo(0.75);
    expect(scaleFromDrag(2, c, [1, 3], [1, 3])).toBeCloseTo(2);
  });

  it('is uniform: only the distance counts, not the direction of the pointer', () => {
    expect(scaleFromDrag(1, c, [3, 1], [1, 5])).toBeCloseTo(2);
    expect(scaleFromDrag(1, c, [3, 1], [1 - 2, 1])).toBeCloseTo(1);
  });

  it('never goes below the minimum, nor breaks when started on the centre', () => {
    expect(scaleFromDrag(1, c, [3, 1], c)).toBe(MIN_SCALE);
    expect(scaleFromDrag(1, c, [3, 1], [1.01, 1])).toBe(MIN_SCALE);
    expect(scaleFromDrag(0.7, c, c, [5, 5])).toBe(0.7);
    expect(scaleFromDrag(1, c, [3, 1], c, 0.2)).toBe(0.2);
  });
});

describe('rotation maths', () => {
  const c: Vec2 = [0, 0];

  it('measures angles counter-clockwise in scene space (y up)', () => {
    expect(angleAround(c, [1, 0])).toBeCloseTo(0);
    expect(angleAround(c, [0, 1])).toBeCloseTo(90);
    expect(angleAround(c, [-1, 0])).toBeCloseTo(180);
    expect(angleAround(c, [0, -1])).toBeCloseTo(-90);
  });

  it('rotates CCW when the pointer goes counter-clockwise on screen (the canvas y flip)', () => {
    const camera: Camera = { frameWidth: 16, frameHeight: 9, center: [0, 0], zoom: 1 };
    const surface: Surface = { width: 1600, height: 900 };
    const centre = toScene([800, 450], camera, surface);
    // Pointer from the right of the centre to above it: smaller pixel y, i.e. counter-clockwise.
    const start = toScene([900, 450], camera, surface);
    const end = toScene([800, 350], camera, surface);
    const tracker = advanceRotation(beginRotation(centre, start), centre, end);
    expect(tracker.total).toBeCloseTo(90);
    expect(rotationFromDrag(10, tracker, false)).toBeCloseTo(100);
    // And the other way: below the centre is clockwise.
    const below = toScene([800, 550], camera, surface);
    expect(advanceRotation(beginRotation(centre, start), centre, below).total).toBeCloseTo(-90);
    // Sanity: the pixel round trip the test relies on.
    near(toPixel(start, camera, surface), [900, 450]);
  });

  it('keeps counting past ±180° instead of jumping back', () => {
    let tracker = beginRotation(c, [1, 0]);
    for (let deg = 30; deg <= 400; deg += 10) {
      const r = (deg * Math.PI) / 180;
      tracker = advanceRotation(tracker, c, [Math.cos(r), Math.sin(r)]);
    }
    expect(tracker.total).toBeCloseTo(400 - 0, 6);
    expect(shortestAngle(190)).toBe(-170);
    expect(shortestAngle(-190)).toBe(170);
    expect(shortestAngle(180)).toBe(180);
    expect(shortestAngle(-180)).toBe(180);
  });

  it('keeps the last angle when the pointer is exactly on the centre', () => {
    const tracker = advanceRotation(beginRotation(c, [1, 0]), c, c);
    expect(tracker).toEqual({ last: 0, total: 0 });
  });

  it('snaps to 15° steps, absolute, never -0', () => {
    expect(snapAngle(7)).toBe(0);
    expect(snapAngle(8)).toBe(15);
    expect(snapAngle(22.4)).toBe(15);
    expect(snapAngle(-8)).toBe(-15);
    expect(Object.is(snapAngle(-7), 0)).toBe(true);
    expect(snapAngle(100, 45)).toBe(90);
  });

  it('adds the snap to the whole rotation, so 0° is reachable from any start', () => {
    const tracker = { last: 0, total: -7.2 }; // start 7.2°, turned back 7.2° → exactly upright
    expect(rotationFromDrag(7.2, tracker, true)).toBe(0);
    expect(rotationFromDrag(7.2, { last: 0, total: 20 }, true)).toBe(30); // 27.2 → 30
    expect(rotationFromDrag(7.2, { last: 0, total: 20 }, false)).toBeCloseTo(27.2);
    expect(rotationFromDrag(0, { last: 0, total: 400 }, false)).toBe(400);
  });
});

describe('snapScale', () => {
  it('rounds to the nearest multiple of the step: hard steps, not a magnet', () => {
    expect(SCALE_SNAP).toBe(0.05); // the default
    expect(snapScale(1.02)).toBe(1);
    expect(snapScale(1.03)).toBe(1.05);
    expect(snapScale(0.98)).toBe(1);
    expect(snapScale(1.22)).toBe(1.2);
    expect(snapScale(1.24)).toBe(1.25);
    expect(snapScale(1.02, 0.2)).toBe(1);
    expect(snapScale(1.09, 0.2)).toBe(1);
    expect(snapScale(1.1, 0.2)).toBe(1.2); // halfway rounds up
    expect(snapScale(1.31, 0.2)).toBe(1.4);
    expect(snapScale(0.19, 0.2)).toBe(0.2);
    expect(snapScale(1.4, 0.2)).toBe(1.4);
  });

  it('never gives 0: the multiples start at the step', () => {
    expect(snapScale(0.03)).toBe(0.05);
    expect(snapScale(0.01)).toBe(0.05);
    expect(snapScale(0.1, 0.2)).toBe(0.2);
  });

  it('rounds away the float noise of the multiples', () => {
    expect(snapScale(2.4, 0.2)).toBe(2.4); // 12 · 0.2 is 2.4000000000000004
    expect(snapScale(1.2000000000000002, 0.2)).toBe(1.2);
    expect(snapScale(1.19, 0.2)).toBe(1.2); // 6 · 0.2 is 1.2000000000000002
    expect(snapScale(0.35)).toBe(0.35); // 7 · 0.05 is 0.35000000000000003
    expect(snapScale(1.1234567)).toBe(1.1);
  });

  it('takes a custom step', () => {
    expect(snapScale(0.52, 0.25)).toBe(0.5);
    expect(snapScale(0.64, 0.25)).toBe(0.75);
    expect(snapScale(1.45, 0.5)).toBe(1.5);
    expect(snapScale(0.3, 1)).toBe(1); // the first multiple is 1, not 0
    expect(snapScale(1.5, 0)).toBe(1.5); // no step: unchanged
  });
});

describe('snappedScale', () => {
  it('goes in steps of 0.05 by default, and is free with Ctrl/⌘', () => {
    expect(snappedScale(1.22, false)).toBe(1.2);
    expect(snappedScale(0.81, false)).toBe(0.8);
    expect(snappedScale(1.13, false)).toBe(1.15);
    expect(snappedScale(1.1, false, undefined, 0.2)).toBe(1.2);
    expect(snappedScale(1.22, true)).toBe(1.22);
    // The preference's step: thirds here (the smallest scale is one step).
    expect(snappedScale(0.9, false, undefined, 1 / 3)).toBe(1);
    expect(snappedScale(0.55, false, undefined, 1 / 3)).toBe(0.666667);
    expect(snappedScale(0.1, false, undefined, 1 / 3)).toBe(0.333333);
    expect(snappedScale(0.1, false, 0.5, 1 / 3)).toBe(0.1); // below the floor: raw
    expect(snappedScale(1.2, true)).toBe(1.2);
  });

  it('keeps the minimum: the clamp lands on the first step, a step below the floor is not taken', () => {
    expect(snappedScale(MIN_SCALE, false)).toBe(SCALE_SNAP); // 0.05: the smallest step too
    expect(snappedScale(MIN_SCALE, false, undefined, 0.2)).toBe(0.2); // 0.05 → 0.2 in those steps
    // A group whose smallest member starts at 0.24 may not shrink by less than 0.05 / 0.24.
    const min = MIN_SCALE / 0.24;
    expect(snappedScale(min, false, min, 0.2)).toBe(min); // 0.2 would put that member below 0.05
    expect(snappedScale(0.21, false, min, 0.2)).toBe(0.21);
    expect(snappedScale(0.42, false, min, 0.2)).toBe(0.4);
  });
});

describe('readouts', () => {
  it('formats the live value shown next to the pointer', () => {
    expect(scaleReadout(1.2345)).toBe('× 1.23');
    expect(scaleReadout(2)).toBe('× 2.00');
    expect(rotationReadout(37.04)).toBe('37°');
    expect(rotationReadout(-90)).toBe('-90°');
    expect(rotationReadout(12.56)).toBe('12.6°');
    expect(rotationReadout(-0.01)).toBe('0°');
  });
});
