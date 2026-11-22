// @vitest-environment node
/* The options of a player from the data attributes of its figure: the defaults, every attribute,
 * the values it cannot read (reported, the default kept) and the options given to `mount`. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, parseOptions } from '../options';

describe('the options of a figure', () => {
  it('are the defaults with only the example named', () => {
    expect(parseOptions({ mfePlayer: 'first-transform' })).toEqual({
      options: { ...DEFAULT_OPTIONS, slug: 'first-transform' },
      problems: [],
    });
    expect(DEFAULT_OPTIONS).toMatchObject({
      timeline: false,
      autoplay: false,
      loop: false,
      controls: 'full',
      speed: 1,
    });
  });

  it('reads every attribute', () => {
    const { options, problems } = parseOptions({
      mfePlayer: ' hero ',
      timeline: '',
      autoplay: '',
      loop: 'true',
      from: '1.5',
      to: '4s',
      start: 'end',
      controls: 'Minimal',
      caption: '  The derivation, step by step. ',
      speed: '2×',
    });
    expect(problems).toEqual([]);
    expect(options).toEqual({
      slug: 'hero',
      timeline: true,
      autoplay: true,
      loop: true,
      from: 1.5,
      to: 4,
      start: 'end',
      controls: 'minimal',
      caption: 'The derivation, step by step.',
      speed: 2,
    });
    expect(parseOptions({ mfePlayer: 'x', start: '2', speed: '0.5' }).options).toMatchObject({
      start: 2,
      speed: 0.5,
    });
  });

  it('turns a boolean off with "false" or "0"', () => {
    const { options } = parseOptions({
      mfePlayer: 'x',
      timeline: 'false',
      loop: '0',
      autoplay: 'off',
    });
    expect(options).toMatchObject({ timeline: false, loop: false, autoplay: false });
  });

  it('keeps the default of a value it cannot read, and says so', () => {
    const { options, problems } = parseOptions({
      mfePlayer: 'x',
      from: 'soon',
      start: 'middle',
      controls: 'some',
      speed: '3',
    });
    expect(options).toMatchObject({ from: null, start: null, controls: 'full', speed: 1 });
    expect(problems).toEqual([
      'data-from="soon" is not a time in seconds.',
      'data-start="middle" is neither a time in seconds nor "end".',
      'data-controls="some" is not full, minimal or none.',
      'data-speed="3" is not one of 0.5, 1, 2.',
    ]);
  });

  it('says when the range would be empty', () => {
    expect(parseOptions({ mfePlayer: 'x', from: '4', to: '2' }).problems).toEqual([
      'data-to (2) is not after data-from (4).',
    ]);
  });

  it('takes the options given to mount over the attributes', () => {
    const { options } = parseOptions(
      { mfePlayer: 'x', loop: '', controls: 'none' },
      { loop: false, timeline: true, caption: undefined },
    );
    expect(options).toMatchObject({ loop: false, timeline: true, controls: 'none', caption: null });
  });
});
