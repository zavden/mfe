/* Focused scene/export geometry regressions. Appended after the existing export cases so their
 * deterministic IDs and pins remain stable. Each project runs against both native engines. */
import {
  createAppear,
  createAttach,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createDisappear,
  createEmphasis,
  createEmptyProject,
  createFormula,
  createMorph,
  createPartTransform,
  createRelation,
  createShapeAttach,
  createShapeFormula,
  createTipAttach,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  type Clip,
  type Formula,
  type Project,
} from '../../model';
interface ExportCase {
  name: string;
  project: Project;
  probe: boolean;
  mathjax?: boolean;
}

function project(name: string): Project {
  const p = createEmptyProject(name);
  Object.assign(p.meta, { width: 480, height: 270, fps: 12 });
  p.tracks = [];
  return p;
}

function clip(p: Project, f: Formula, start = 0, end = 5, fields: Partial<Clip> = {}): Clip {
  if (!p.formulas.includes(f)) p.formulas.push(f);
  const track = createTrack(f.name);
  p.tracks.push(track);
  const c = createClip(f.id, track.id, start, end, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
    ...fields,
  });
  p.clips.push(c);
  return c;
}

export function sharedFits(): Project {
  const p = project('Shared fitted dimensions');
  for (const [i, kind] of (['brace', 'box', 'circle', 'underline', 'cross'] as const).entries()) {
    const y = 2.8 - i * 1.3;
    const host = clip(p, createShapeFormula({ name: `host${i}`, width: 1, height: 0.35 }));
    host.initial.position = [-3, y];
    host.actions.push(createTween(1.5, 1, { scale: 1.5 }, 'linear'));
    const target = clip(p, createShapeFormula({ name: `other${i}`, width: 2, height: 0.45 }));
    target.initial.position = [2, y];
    const f =
      kind === 'brace'
        ? createBraceFormula({ name: `shared${i}` })
        : createShapeFormula({ name: `shared${i}`, shape: kind });
    const attach = (id: string) =>
      kind === 'brace'
        ? createBraceAttach(id, 'all', {
            direction: i === 0 ? 30 : 0,
            buff: 0.1,
          })
        : createShapeAttach(id, 'all', 0.1);
    // Project order owns dimensions even when the next clip starts earlier.
    const owner = clip(p, f, 3, 5, { attach: attach(host.id) });
    Object.assign(owner.initial, {
      scale: 0.8,
      opacity: 0.3,
      color: '#00FF00',
      flipX: true,
    });
    const other = clip(p, f, 1, 5, { attach: attach(target.id) });
    Object.assign(other.initial, {
      scale: 1.2,
      opacity: 0.75,
      color: '#0000FF',
      flipY: true,
    });
    const detached = clip(p, f, 4, 5);
    Object.assign(detached.initial, {
      position: [5, y],
      scale: 0.6,
      opacity: 0.5,
      color: '#FF0000',
      rotation: 20,
    });
  }
  return p;
}

export function earlyAttachments(): Project {
  const p = project('Early attachment geometry');
  const host = clip(p, createFormula({ name: 'host', source: 'x^2+bx+c' }), 0, 6);
  host.initial.position = [-3, 2];
  host.actions.push(createTween(1, 1, { position: [2, 2], rotation: 20 }, 'linear'));
  const brace = clip(p, createBraceFormula({ name: 'brace' }), 3, 6, {
    attach: createBraceAttach(host.id, 'all'),
    actions: [createTween(0.25, 0.5, { position: [3, 0.5] }, 'linear')],
  });
  const label = clip(p, createFormula({ name: 'label', source: 'bcs' }), 3.5, 6, {
    attach: createTipAttach(brace.id),
  });
  Object.assign(label.initial, { scale: 1.3, opacity: 0.6, color: '#58C4DD' });
  clip(p, createShapeFormula({ name: 'earlybox' }), 2, 6, {
    attach: createShapeAttach(label.id, 'all'),
  });
  const next = clip(p, createFormula({ name: 'earlynext', source: 's' }), 1, 6, {
    attach: createAttach(brace.id, 'all', { side: 'left', buff: 0.4 }),
  });
  next.initial.rotation = 35;
  clip(p, createShapeFormula({ name: 'earlycircle', shape: 'circle' }), 0.5, 6, {
    attach: createShapeAttach(next.id, 'all'),
  });
  clip(p, createFormula({ name: 'earlytip', source: 'c' }), 2.5, 6, {
    attach: createTipAttach(brace.id, 0.5),
  });
  return p;
}

export function hiddenReturns(): Project {
  const p = project('Hidden returning tween endpoints');
  for (const [i, mode] of [
    'initial',
    'return',
    'partial',
    'relation',
    'morph',
    'linear',
  ].entries()) {
    const x = -5 + i * 2;
    const f = createShapeFormula({
      name: `hidden${i}`,
      shape: mode === 'partial' || mode === 'morph' ? 'cross' : 'box',
      width: 0.8,
      height: 0.5,
      style: {
        fillOpacity: mode === 'partial' || mode === 'morph' ? 0 : 0.2,
        strokeOpacity: 0.7,
        strokeWidth: 4,
      },
    });
    const c = clip(p, f);
    c.initial.position = [x, 1.5];
    if (mode === 'return') {
      c.actions.push(
        createPartTransform(0.25, [0], {
          duration: 0.25,
          opacity: 0.2,
          color: '#00FF00',
          easing: 'linear',
        }),
        createDisappear(0.75, 'fade_out', [0], {
          duration: 0.25,
          easing: 'linear',
        }),
      );
    }
    const easing =
      mode === 'linear' ? 'linear' : i % 2 ? 'there_and_back_with_pause' : 'there_and_back';
    c.actions.push(
      createTween(
        1.25,
        1,
        {
          position: [x + 0.5, 1],
          scale: 1.5,
          rotation: 60,
          flipX: true,
          color: '#FF0000',
          opacity: 0.6,
        },
        easing,
      ),
    );
    if (mode === 'relation') {
      const source = clip(
        p,
        createShapeFormula({
          name: `source${i}`,
          shape: 'circle',
          width: 0.4,
          height: 0.4,
          style: { fillOpacity: 0.2, strokeOpacity: 0.7, strokeWidth: 4 },
        }),
      );
      source.initial.position = [x, -1.5];
      const pairs = [{ from: [0], to: [0], style: 'transform' as const }];
      p.relations.push(
        createRelation(source.id, c.id, {
          offset: 3,
          duration: 0.5,
          pairs,
          easing: 'linear',
        }),
      );
    } else if (mode === 'morph') {
      c.actions.push(
        createMorph(3, {
          duration: 0.5,
          pairs: [{ from: [1], to: [0], style: 'copy' }],
          easing: 'linear',
        }),
      );
    } else c.actions.push(createAppear(3, 'fade_in', [0], { duration: 0.5, easing: 'linear' }));
    c.actions.push(createTween(4, 0.5, { position: [x, 0.5] }, 'linear'));
  }
  return p;
}

export function curvedPivots(): Project {
  const p = project('Curved glyph animation pivots');
  const f = createFormula({ name: 'parts', source: 'bcs' });
  const part = clip(p, f);
  Object.assign(part.initial, {
    position: [-3, 1.5],
    scale: 2.5,
    rotation: 40,
    flipX: true,
  });
  part.actions.push(
    createPartTransform(0.5, [0], {
      duration: 1,
      scale: 2,
      rotation: 25,
      easing: 'linear',
    }),
    createPartTransform(2, [0, 2], {
      duration: 1,
      scale: 0.6,
      rotation: -35,
      shift: [0.4, 0.2],
      easing: 'linear',
    }),
    createEmphasis(3.5, 'indicate', [0], { duration: 1, scale: 1.8 }),
  );
  const wiggle = clip(p, createFormula({ name: 'wavy', source: 'cs\\int' }));
  Object.assign(wiggle.initial, {
    position: [2.5, 1.5],
    scale: 2.3,
    rotation: 60,
    flipY: true,
  });
  wiggle.actions.push(
    createEmphasis(0.5, 'wiggle', [0, 1], {
      duration: 2,
      scale: 1.4,
      angle: 25,
      wiggles: 3,
    }),
  );
  for (const [i, kind] of (['fade_in', 'grow_from_center'] as const).entries()) {
    const c = clip(p, createFormula({ name: `intro${i}`, source: 'b' }), 0, 5, {
      intro: { ...defaultIntro(kind), duration: 1, scale: 2, easing: 'linear' },
      outro: {
        ...defaultOutro(i ? 'shrink_to_center' : 'fade_out'),
        duration: 1,
        scale: 2,
        easing: 'linear',
      },
    });
    Object.assign(c.initial, {
      position: [-3 + i * 5, -2],
      scale: 3,
      rotation: 40,
    });
  }
  return p;
}

export function geometryCases(): ExportCase[] {
  return [
    {
      name: 'geometry-shared-fits',
      project: sharedFits(),
      probe: true,
      mathjax: true,
    },
    {
      name: 'geometry-early-attachments',
      project: earlyAttachments(),
      probe: true,
      mathjax: true,
    },
    { name: 'geometry-hidden-returns', project: hiddenReturns(), probe: true },
    {
      name: 'geometry-curved-pivots',
      project: curvedPivots(),
      probe: true,
      mathjax: true,
    },
  ];
}
