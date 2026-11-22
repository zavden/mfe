import { beforeEach, describe, expect, it } from 'vitest';
import { notify, useNoticeStore } from '../noticeStore';

const titles = () => useNoticeStore.getState().notices.map((n) => n.title);

beforeEach(() => useNoticeStore.getState().clear());

describe('notify', () => {
  it('keeps four notices, dropping the oldest that is not an error', () => {
    notify({ kind: 'error', title: 'e1' });
    notify({ kind: 'info', title: 'i1' });
    notify({ kind: 'warning', title: 'w1' });
    notify({ kind: 'info', title: 'i2' });
    notify({ kind: 'info', title: 'i3' });
    expect(titles()).toEqual(['e1', 'w1', 'i2', 'i3']);
    // Errors stay until dismissed; only when there is nothing else does the oldest error go.
    for (const t of ['e2', 'e3', 'e4', 'e5']) notify({ kind: 'error', title: t });
    expect(titles()).toEqual(['e2', 'e3', 'e4', 'e5']);
  });
});
