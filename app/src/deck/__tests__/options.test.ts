// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, readOptions, resolveOptions } from '../options';

const from = (values: Record<string, string>) => (name: string) => values[name] ?? null;

describe('readOptions', () => {
  it('reads what is given, and nothing else', () => {
    expect(readOptions(from({}))).toEqual({});
    expect(
      readOptions(
        from({
          controls: 'minimal',
          notes: 'off',
          autoplay: '',
          loop: 'true',
          start: '3.5',
          pauses: 'off',
          background: 'transparent',
          renderer: 'canvas',
          keys: 'none',
          speed: '2',
        }),
      ),
    ).toEqual({
      controls: 'minimal',
      notes: false,
      autoplay: true,
      loop: true,
      start: 3.5,
      pauses: false,
      background: 'transparent',
      renderer: 'canvas',
      keys: 'none',
      speed: 2,
    });
  });

  it('takes a switch that is present for on, and off, false, no and 0 for off', () => {
    expect(readOptions(from({ autoplay: '' })).autoplay).toBe(true);
    expect(readOptions(from({ autoplay: 'autoplay' })).autoplay).toBe(true);
    for (const word of ['off', 'false', 'no', '0', ' OFF ']) {
      expect(readOptions(from({ autoplay: word })).autoplay).toBe(false);
    }
    expect(readOptions(from({ controls: 'off' })).controls).toBe('none');
    expect(readOptions(from({ controls: 'false' })).controls).toBe('none');
  });

  it('takes a word that means nothing as none', () => {
    expect(
      readOptions(
        from({ controls: 'huge', start: '-1', background: 'red', renderer: 'webgl', speed: 'x' }),
      ),
    ).toEqual({});
    expect(readOptions(from({ start: '' }))).toEqual({});
    expect(readOptions(from({ speed: '99' })).speed).toBe(4);
    expect(readOptions(from({ speed: '0.01' }))).toEqual({});
  });
});

describe('resolveOptions', () => {
  it('starts from the defaults', () => {
    expect(resolveOptions(() => null, null)).toEqual(DEFAULT_OPTIONS);
    expect(DEFAULT_OPTIONS).toMatchObject({
      controls: 'full',
      notes: true,
      renderer: 'svg',
      keys: 'focus',
    });
  });

  it('reads the element’s data attributes', () => {
    const options = resolveOptions(from({ 'data-controls': 'none', 'data-loop': '' }), null);
    expect(options).toMatchObject({ controls: 'none', loop: true, autoplay: false });
  });

  it('hears the keys on the whole page, and reads the address, when the page is the scene’s own', () => {
    const options = resolveOptions(
      from({ 'data-controls': 'full', 'data-start': '1' }),
      '?controls=minimal&autoplay&start=2&notes=no',
    );
    expect(options).toMatchObject({
      keys: 'page',
      controls: 'minimal',
      autoplay: true,
      start: 2,
      notes: false,
    });
    // An embedded scene does not read the address of the page that hosts it.
    expect(resolveOptions(() => null, null).keys).toBe('focus');
    expect(resolveOptions(from({ 'data-keys': 'focus' }), '').keys).toBe('focus');
  });

  it('puts what the caller of mount passed over everything, but not an undefined', () => {
    const options = resolveOptions(from({ 'data-loop': '', 'data-speed': '2' }), '?speed=0.5', {
      speed: 1.5,
      loop: undefined,
    });
    expect(options).toMatchObject({ speed: 1.5, loop: true });
  });
});
