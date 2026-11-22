// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import {
  createColorMatch,
  createEmptyProject,
  parseProject,
  serializeProject,
  setIdGenerator,
  validateProject,
} from '../../../model';
import { loadProject, useProjectStore } from '../../../store';
import { deleteColorMatchList, renameColorMatchList } from '../colorMatchActions';

afterEach(() => loadProject(createEmptyProject()));

describe('match-color identity import repair', () => {
  it('reports duplicate IDs globally and preserves both independently editable lists', () => {
    const p = createEmptyProject();
    const first = createColorMatch('First', [{ pattern: 'x', color: '#FF0000' }]);
    const second = createColorMatch('Second', [{ pattern: 'y', color: '#00FF00' }]);
    second.id = first.id;
    p.colorMatches = [first, second];
    expect(validateProject(p).filter((i) => i.code === 'duplicate-id')).toHaveLength(1);
    const parsed = parseProject(serializeProject(p));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.issues.map((i) => i.code)).toEqual([
      'color-match-id-repaired',
      'color-match-id-repaired',
    ]);
    const [a, b] = parsed.project.colorMatches;
    expect(a!.id).not.toBe(first.id);
    expect(b!.id).not.toBe(first.id);
    expect(a!.id).not.toBe(b!.id);
    expect([a!.entries, b!.entries]).toEqual([first.entries, second.entries]);
    loadProject(parsed.project);
    renameColorMatchList(b!.id, 'Only second');
    expect(useProjectStore.getState().project.colorMatches.map((m) => m.name)).toEqual([
      'First',
      'Only second',
    ]);
    deleteColorMatchList(b!.id);
    expect(useProjectStore.getState().project.colorMatches).toEqual([a]);
  });

  it('repairs a collision with another entity and reserves every original list ID', () => {
    const p = createEmptyProject();
    const first = createColorMatch('Collision');
    first.id = p.tracks[0]!.id;
    const retained = createColorMatch('Unchanged');
    retained.id = 'm_reserved';
    p.colorMatches = [first, retained];
    expect(validateProject(p).filter((i) => i.code === 'duplicate-id')[0]!.path).toEqual([
      'colorMatches',
      0,
      'id',
    ]);
    const ids = [first.id, retained.id, 'm_repaired'];
    const restore = setIdGenerator(() => ids.shift()!);
    try {
      const parsed = parseProject(serializeProject(p));
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.project.colorMatches.map((m) => m.id)).toEqual(['m_repaired', 'm_reserved']);
      expect(parsed.project.tracks).toEqual(p.tracks);
      expect(validateProject(parsed.project)).toEqual([]);
      const saved = serializeProject(parsed.project);
      const reopened = parseProject(saved);
      if (!reopened.ok) throw new Error(reopened.error);
      expect(reopened.issues).toEqual([]);
      expect(serializeProject(reopened.project)).toBe(saved);
    } finally {
      restore();
    }
  });
});
