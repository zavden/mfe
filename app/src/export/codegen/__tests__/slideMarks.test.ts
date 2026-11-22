// @vitest-environment node
/* The marks of the Slides mode in the generated Python (format 35, D200): where each is written
 * among the steps of the scene (`placeMarks`), what its lines say (`markLines`), and the scene they
 * are written in — always, whatever the options, and never as code. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAudioClip,
  createAudioTrack,
  createClip,
  createEmphasis,
  createEmptyProject,
  createFormula,
  defaultIntro,
  setIdGenerator,
  type Project,
  type SlideMark,
  type Target,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import { boxSnapshot, smallProject } from '../../../model/__tests__/fixtures';
import type { CodegenOptions } from '../../types';
import { generatePython } from '../index';
import { markLines } from '../marks';
import { placeMarks, type Placed, type Step, type Timed } from '../timeline';

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

const pause = (id: string, time: number, text?: string): SlideMark => ({
  id,
  time,
  kind: 'pause',
  ...(text === undefined ? {} : { text }),
});
const comment = (id: string, time: number, text: string): SlideMark => ({
  id,
  time,
  kind: 'comment',
  text,
});

describe('where a mark goes among the steps', () => {
  const timed = (name: string, f0: number, f1: number): Timed<string> => ({
    event: name,
    f0,
    f1,
  });
  const play = (name: string, f0: number, f1: number): Step<string> => ({
    kind: 'play',
    f0,
    f1,
    parts: [
      { item: timed(name, f0, f1), from: 0, to: f1 - f0, whole: true, first: true, last: true },
    ],
  });
  const wait = (f0: number, f1: number): Step<string> => ({ kind: 'wait', f0, f1 });
  const add = (name: string, frame: number): Step<string> => ({
    kind: 'instant',
    frame,
    items: [timed(name, frame, frame)],
  });
  /** The placed steps in short: `play a 0-30`, `wait 30-45`, `add b @30`, `mark p1 @45`. */
  const read = (placed: Placed<string, string>[]) =>
    placed.map((item) => {
      switch (item.kind) {
        case 'mark':
          return `mark ${item.mark} @${item.frame}${item.movedOutOf ? ' moved' : ''}`;
        case 'instant':
          return `add ${item.items.map((i) => i.event).join(' ')} @${item.frame}`;
        case 'wait':
          return `wait ${item.f0}-${item.f1}`;
        case 'play':
          return `play ${item.parts.map((p) => p.item.event).join(' ')} ${item.f0}-${item.f1}`;
      }
    });
  // At 30 fps: a Write over [0, 1] s, a wait over [1, 2] s, a FadeIn over [2, 3] s and a FadeOut
  // over [3, 4] s, with something added without an animation at 3 s; the scene ends at 4 s.
  const steps = [
    play('write', 0, 30),
    wait(30, 60),
    play('fade_in', 60, 90),
    add('dot', 90),
    play('fade_out', 90, 120),
  ];
  const place = (marks: [string, number][]) =>
    read(
      placeMarks(
        steps,
        marks.map(([mark, time]) => ({ mark, time })),
        30,
      ),
    );

  it('leaves the steps as they are without marks', () => {
    expect(placeMarks(steps, [], 30)).toEqual(steps);
  });

  it('splits a wait a mark falls in into two that add up to its frames', () => {
    expect(place([['p1', 1.5]])).toEqual([
      'play write 0-30',
      'wait 30-45',
      'mark p1 @45',
      'wait 45-60',
      'play fade_in 60-90',
      'add dot @90',
      'play fade_out 90-120',
    ]);
  });

  it('splits a wait in three for two marks, and keeps two marks of one frame together', () => {
    expect(
      place([
        ['n1', 1.2],
        ['p1', 1.2],
        ['p2', 1.7],
      ]).slice(1, 7),
    ).toEqual([
      'wait 30-36',
      'mark n1 @36',
      'mark p1 @36',
      'wait 36-51',
      'mark p2 @51',
      'wait 51-60',
    ]);
  });

  it('writes a mark where a wait ends, or begins, between the two steps', () => {
    expect(place([['p1', 1]]).slice(0, 3)).toEqual([
      'play write 0-30',
      'mark p1 @30',
      'wait 30-60',
    ]);
    expect(place([['p1', 2]]).slice(1, 4)).toEqual([
      'wait 30-60',
      'mark p1 @60',
      'play fade_in 60-90',
    ]);
  });

  it('writes a mark after what happens on its frame without an animation, before what starts', () => {
    expect(place([['p1', 3]]).slice(2)).toEqual([
      'play fade_in 60-90',
      'add dot @90',
      'mark p1 @90',
      'play fade_out 90-120',
    ]);
  });

  it('writes a mark at 0 s after the instants of frame 0, before the first play', () => {
    const first = [add('dot', 0), play('write', 0, 30), wait(30, 60)];
    expect(read(placeMarks(first, [{ mark: 'p1', time: 0 }], 30))).toEqual([
      'add dot @0',
      'mark p1 @0',
      'play write 0-30',
      'wait 30-60',
    ]);
  });

  it('writes the marks at the end of the scene and after it last, in order, adding no wait', () => {
    expect(
      place([
        ['p1', 4],
        ['n1', 5.5],
        ['p2', 5.5],
        ['p3', 7],
      ]).slice(4),
    ).toEqual([
      'play fade_out 90-120',
      'mark p1 @120',
      'mark n1 @165',
      'mark p2 @165',
      'mark p3 @210',
    ]);
  });

  it('takes a mark the grid put inside a play to the nearer edge of it, the start on a tie', () => {
    // A play of frames [30, 40): its start is 1 s, its end 1.333 s.
    const short = [play('write', 0, 30), play('indicate', 30, 40), wait(40, 60)];
    const at = (time: number) =>
      read(placeMarks(short, [{ mark: 'p1', time }], 30)).filter((s) => s.startsWith('mark'));
    expect(at(1.1)).toEqual(['mark p1 @30 moved']);
    expect(at(1 + 5 / 30)).toEqual(['mark p1 @30 moved']);
    expect(at(1.2)).toEqual(['mark p1 @40 moved']);
    // Only inside: on the edges a mark is where it was.
    expect(at(1)).toEqual(['mark p1 @30']);
    expect(at(4 / 3)).toEqual(['mark p1 @40']);
    // Two marks in one play, each to its own edge, in their order; the play is named.
    const placed = placeMarks(
      short,
      [
        { mark: 'p1', time: 1.05 },
        { mark: 'p2', time: 1.25 },
      ],
      30,
    );
    expect(read(placed)).toEqual([
      'play write 0-30',
      'mark p1 @30 moved',
      'play indicate 30-40',
      'mark p2 @40 moved',
      'wait 40-60',
    ]);
    expect(placed[1]!.kind === 'mark' && placed[1]!.movedOutOf).toBe(short[1]);
  });

  it('puts a mark taken to the end of a play after the instants of that frame', () => {
    const cut = [play('write', 0, 30), play('indicate', 30, 40), add('dot', 40), wait(40, 60)];
    expect(read(placeMarks(cut, [{ mark: 'p1', time: 1.3 }], 30)).slice(2)).toEqual([
      'add dot @40',
      'mark p1 @40 moved',
      'wait 40-60',
    ]);
  });

  it('writes every mark of a scene with nothing to play', () => {
    expect(read(placeMarks([], [{ mark: 'p1', time: 0 }], 30))).toEqual(['mark p1 @0']);
  });
});

describe('the lines of a mark', () => {
  it('says what a comment says, and when', () => {
    expect(markLines(comment('n1', 5, 'Flash the b'), null)).toEqual([
      '# NOTE (5.00 s): Flash the b',
    ]);
  });

  it('numbers a pause among the exported ones, with its note when it has one', () => {
    expect(markLines(pause('p1', 3.2), { number: 2, of: 5 })).toEqual(['# PAUSE 2 of 5 (3.20 s)']);
    expect(markLines(pause('p1', 3.2, 'Ask the room'), { number: 2, of: 5 })).toEqual([
      '# PAUSE 2 of 5 (3.20 s): Ask the room',
    ]);
  });

  it('says that the exported page skips the wait after a pause, and how long, before its note', () => {
    expect(markLines(pause('p1', 1.5), { number: 1, of: 3, skipped: 0.5 })).toEqual([
      '# PAUSE 1 of 3 (1.50 s), the exported page skips the 0.50 s wait after it',
    ]);
    expect(
      markLines(pause('p1', 1.5, 'Ask\nthen go on'), { number: 1, of: 3, skipped: 0.25 }),
    ).toEqual([
      '# PAUSE 1 of 3 (1.50 s), the exported page skips the 0.25 s wait after it: Ask',
      '#   then go on',
    ]);
    expect(markLines(pause('p1', 1.5), { number: 1, of: 3, skipped: null })).toEqual([
      '# PAUSE 1 of 3 (1.50 s)',
    ]);
  });

  it('writes a text of several lines in comment lines of its own, under the first', () => {
    expect(
      markLines(
        comment('n1', 1.5, '\n  \nFirst line  \r\nSecond\r\n\n  - indented\rLast\n\n'),
        null,
      ),
    ).toEqual(['# NOTE (1.50 s): First line', '#   Second', '#', '#     - indented', '#   Last']);
  });

  it('writes a comment without words as its instant alone', () => {
    expect(markLines(comment('n1', 0, ' \n '), null)).toEqual(['# NOTE (0.00 s)']);
  });

  it('keeps every line a comment, whatever the text holds', () => {
    const lines = markLines(
      comment('n1', 2, 'a\nself.remove(f1)\r\nimport os\rprint("x")\0\x0b\x0c # "q" \'s\n\\'),
      null,
    );
    expect(lines).toEqual([
      '# NOTE (2.00 s): a',
      '#   self.remove(f1)',
      '#   import os',
      '#   print("x") # "q" \'s',
      '#   \\',
    ]);
  });
});

describe('the marks in the generated Python', () => {
  const options = (target: Target, extra: Partial<CodegenOptions> = {}): CodegenOptions => ({
    target,
    sceneName: 'Marks',
    indexing: 'auto',
    comments: true,
    ...extra,
  });
  const code = (project: Project, target: Target = 'ce', extra: Partial<CodegenOptions> = {}) =>
    generatePython(project, new Map(), options(target, extra)).code;
  /** `smallProject` (60 fps) with these marks. Its clips are on screen over [0, 4] and [2, 6], each
   * with an intro and an outro of 1 s, and its relation runs during [2, 3): the scene plays over
   * [0, 1], [2, 3], [3, 4] and [5, 6], and waits over [1, 2] and [4, 5]. */
  const withMarks = (...marks: SlideMark[]) => {
    const p = smallProject();
    p.slides = { marks };
    return p;
  };
  /** The lines of `construct` that play the scene — its plays, waits, adds and removes — and the
   * lines of the marks, unindented: what the order of the scene is about. */
  const timeline = (python: string) => {
    const body = python.slice(python.indexOf('def construct(self):'));
    return body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(self\.(play|wait|add|remove)\(|# (NOTE|PAUSE) |#( {3}|$))/.test(line))
      .map((line) => line.replace(/^self\.play\(.*$/, 'self.play(…)'));
  };

  it.each(['ce', 'gl'] as const)(
    'writes each mark at its instant, between the steps or splitting a wait (%s)',
    (target) => {
      const python = code(
        withMarks(
          pause('p_1', 0),
          comment('p_2', 1.5, 'Line one\nLine two'),
          pause('p_3', 3, 'The two at once'),
          pause('p_4', 4.25),
          pause('p_5', 6),
        ),
        target,
      );
      expect(timeline(python)).toEqual([
        '# PAUSE 1 of 4 (0.00 s)',
        'self.play(…)',
        'self.wait(0.5)',
        '# NOTE (1.50 s): Line one',
        '#   Line two',
        'self.wait(0.5)',
        'self.play(…)',
        '# PAUSE 2 of 4 (3.00 s): The two at once',
        'self.play(…)',
        'self.wait(0.25)',
        '# PAUSE 3 of 4 (4.25 s)',
        'self.wait(0.75)',
        'self.play(…)',
        '# PAUSE 4 of 4 (6.00 s)',
      ]);
      // A group of marks stands apart, a blank line before it and after it, but at the end.
      expect(python).toContain(
        [
          '        self.wait(0.5)',
          '',
          '        # NOTE (1.50 s): Line one',
          '        #   Line two',
          '',
          '        # 1.5 s – 2 s',
          '        self.wait(0.5)',
        ].join('\n'),
      );
      expect(python.endsWith('\n        # PAUSE 4 of 4 (6.00 s)\n')).toBe(true);
      // The scene keeps its frames: the two waits add up to the one of before.
      expect(python).toContain('exactly 360 frames');
    },
  );

  it.each(['ce', 'gl'] as const)(
    'says that the page skips the wait after a pause that skips it, and keeps the wait (%s)',
    (target) => {
      const skipping = (id: string, time: number, text?: string): SlideMark => ({
        ...pause(id, time, text),
        skipWait: true,
      });
      const marks = [
        skipping('p_1', 1.25, 'Ask'),
        pause('p_2', 1.75),
        skipping('p_3', 3), // the instant between two animations: nothing to skip
        skipping('p_4', 4.25),
        skipping('p_5', 6), // after the last animation: nothing to skip
      ];
      const python = code(withMarks(...marks), target);
      expect(timeline(python)).toEqual([
        'self.play(…)',
        'self.wait(0.25)',
        '# PAUSE 1 of 5 (1.25 s), the exported page skips the 0.50 s wait after it: Ask',
        'self.wait(0.5)',
        '# PAUSE 2 of 5 (1.75 s)',
        'self.wait(0.25)',
        'self.play(…)',
        '# PAUSE 3 of 5 (3.00 s)',
        'self.play(…)',
        'self.wait(0.25)',
        '# PAUSE 4 of 5 (4.25 s), the exported page skips the 0.75 s wait after it',
        'self.wait(0.75)',
        'self.play(…)',
        '# PAUSE 5 of 5 (6.00 s)',
      ]);
      // Otherwise the very scene of the pauses that keep their wait.
      const kept = code(
        withMarks(...marks.map((mark) => ({ ...mark, skipWait: undefined }))),
        target,
      );
      expect(python.replace(/, the exported page skips the [\d.]+ s wait after it/g, '')).toBe(
        kept,
      );
    },
  );

  it('writes a mark after what appears on its frame without an animation, before what starts', () => {
    const p = withMarks(pause('p_1', 2));
    // The second clip appears at 2 s without an intro, as the relation starts.
    p.clips[1]!.intro = { ...p.clips[1]!.intro, kind: 'none', duration: 0 };
    expect(timeline(code(p)).slice(1, 6)).toEqual([
      'self.wait(1)',
      'self.add(*b_g[:3])',
      '# PAUSE 1 of 1 (2.00 s)',
      'self.play(…)',
      'self.play(…)',
    ]);
  });

  it('writes a mark at 0 s after what is there from the start, before the first play', () => {
    const p = withMarks(comment('p_1', 0, 'Start here'));
    const still = createFormula({ name: 'k', source: 'k', snapshot: boxSnapshot(['k']) });
    p.formulas.push(still);
    p.clips.push(createClip(still.id, p.tracks[1]!.id, 0, 1, { intro: defaultIntro('none') }));
    expect(timeline(code(p)).slice(0, 3)).toEqual([
      'self.add(k)',
      '# NOTE (0.00 s): Start here',
      'self.play(…)',
    ]);
  });

  it('writes the marks of the tail where only sound plays at the end, keeping the scene', () => {
    // A project is a value: what is worked out of one is kept for it, so each is made anew.
    const made = (sound: boolean) => {
      const p = withMarks(pause('p_1', 4.5), comment('p_2', 7, 'Thank you'), pause('p_3', 8));
      const voice = createAudioTrack('Voice');
      p.tracks.push(voice);
      if (sound) p.audioClips.push(createAudioClip('unavailable-source', voice.id, 0, 8));
      return p;
    };
    const p = made(true);
    const python = code(p);
    expect(timeline(python).slice(-6)).toEqual([
      'self.wait(0.5)',
      '# PAUSE 1 of 2 (4.50 s)',
      'self.wait(0.5)',
      'self.play(…)',
      '# NOTE (7.00 s): Thank you',
      '# PAUSE 2 of 2 (8.00 s)',
    ]);
    // Without the sound they are past the end of the scene, and left out.
    const before = code(made(false));
    expect(before).not.toContain('Thank you');
    expect(before).toContain('# PAUSE 1 of 1 (4.50 s)');
    // With it, the scene is the visual part still: 6 s, and no wait for the tail.
    expect(python).toContain('# exactly 360 frames. The editor');
    expect(generatePython(p, new Map(), options('ce')).issues.map((i) => i.code)).not.toContain(
      'slide-mark-outside',
    );
  });

  it('writes a comment before a pause at one instant, whatever the order of the file', () => {
    const python = code(withMarks(pause('p_1', 1.5), comment('p_2', 1.5, 'First')));
    expect(timeline(python).slice(2, 5)).toEqual([
      '# NOTE (1.50 s): First',
      '# PAUSE 1 of 1 (1.50 s)',
      'self.wait(0.5)',
    ]);
  });

  it('leaves out the marks out of place, says so, and numbers the pauses it writes', () => {
    const p = withMarks(
      pause('p_1', 0.5),
      pause('p_2', 1.5),
      pause('p_3', 1.5),
      comment('p_4', 4.5, 'Here'),
      pause('p_5', 9),
    );
    const { code: python, issues } = generatePython(p, new Map(), options('ce'));
    expect(timeline(python).filter((line) => line.startsWith('#'))).toEqual([
      '# PAUSE 1 of 1 (1.50 s)',
      '# NOTE (4.50 s): Here',
    ]);
    expect(issues.filter((i) => i.code.startsWith('slide-mark-'))).toMatchObject([
      { code: 'slide-mark-busy', path: ['slides', 'marks', 0, 'time'] },
      { code: 'slide-mark-twice', path: ['slides', 'marks', 2, 'time'] },
      { code: 'slide-mark-outside', path: ['slides', 'marks', 4, 'time'] },
    ]);
    expect(issues.find((i) => i.code === 'slide-mark-busy')!.message).toBe(
      'The pause at 0.5 s is where the intro of "a" runs: a mark stands where nothing animates, and the exports leave this one out. Move it or delete it.',
    );
  });

  it('writes the marks with the comments of the export turned off', () => {
    const python = code(withMarks(comment('p_1', 1.5, 'Kept'), pause('p_2', 4)), 'gl', {
      comments: false,
    });
    expect(python).toContain('# NOTE (1.50 s): Kept');
    expect(python).toContain('# PAUSE 1 of 1 (4.00 s)');
    expect(python).not.toContain('# 1 s – 1.5 s');
    expect(timeline(python).slice(1, 4)).toEqual([
      'self.wait(0.5)',
      '# NOTE (1.50 s): Kept',
      'self.wait(0.5)',
    ]);
  });

  it('writes no code of a text: every line it adds is a comment, or a part of a wait', () => {
    const hostile = 'x\nself.remove(a)\r\n    import os\rprint("""\0\x0c"""); # \'q\'\n\\';
    for (const target of ['ce', 'gl'] as const) {
      const plain = code(smallProject(), target).split('\n');
      const marked = code(
        withMarks(comment('p_1', 1.5, hostile), pause('p_2', 4.5, hostile)),
        target,
      );
      const added = marked.split('\n').filter((line) => !plain.includes(line));
      expect(added.length).toBeGreaterThan(8);
      for (const line of added) {
        expect(line).toMatch(/^ {8}(#.*|self\.wait\(0\.5\)|)$/);
      }
      expect(marked).not.toContain('\0');
      expect(marked).not.toContain('\r');
    }
  });

  it('keeps a scene with nothing to play Python, with its marks', () => {
    const p = createEmptyProject('Empty');
    p.slides = { marks: [comment('p_1', 0, 'Nothing yet')] };
    expect(code(p, 'gl')).toContain(
      '    def construct(self):\n\n        # NOTE (0.00 s): Nothing yet\n        pass\n',
    );
  });

  it('keeps the Python of a project without marks as it was', () => {
    for (const target of ['ce', 'gl'] as const) {
      const plain = smallProject();
      const empty = withMarks();
      expect(generatePython(empty, new Map(), options(target))).toEqual(
        generatePython(plain, new Map(), options(target)),
      );
    }
  });

  it('takes a mark the frame grid put inside an animation to its nearer edge, and says so', () => {
    // At 10 fps: an Indicate of 0.02 s at 1 s is stretched to a frame, and pushes the next one,
    // over [1.02, 1.5] s, to start a frame later: on the grid it ends at 1.6 s, after the pause
    // at 1.5 s, which stands just where it ends.
    const p = withMarks(pause('p_1', 1.5));
    p.meta.fps = 10;
    p.clips[0]!.actions.push(
      createEmphasis(1, 'indicate', 'all', { duration: 0.02 }),
      createEmphasis(1.02, 'indicate', 'all', { duration: 0.48 }),
    );
    const { code: python, issues } = generatePython(p, new Map(), options('ce'));
    expect(timeline(python).slice(1, 6)).toEqual([
      'self.play(…)',
      'self.play(…)',
      '# PAUSE 1 of 1 (1.50 s)',
      'self.wait(0.4)',
      'self.play(…)',
    ]);
    expect(issues.filter((i) => i.code === 'export-slide-mark')).toEqual([
      {
        severity: 'warning',
        code: 'export-slide-mark',
        message:
          'The pause at 1.5 s falls during a indicate once the times are on the 10 fps frame grid: the Python has it just after that animation, at 1.6 s.',
        path: ['slides', 'marks', 0, 'time'],
      },
    ]);
  });
});
