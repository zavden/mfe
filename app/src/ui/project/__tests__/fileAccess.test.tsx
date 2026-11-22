import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserFileAccess,
  FILE_ACCESS_TOLD_KEY,
  fileAccessNotice,
  startFileAccessNotice,
} from '../fileAccess';
import { NoticeHost } from '../NoticeHost';
import { AUTO_DISMISS_MS, notify, useNoticeStore } from '../noticeStore';

const notices = () => useNoticeStore.getState().notices;

beforeEach(() => {
  window.sessionStorage.clear();
  useNoticeStore.getState().clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fileAccessNotice', () => {
  it('has nothing to say of a browser that opens files and folders in place', () => {
    expect(fileAccessNotice({ files: true, folders: true })).toBeNull();
  });

  it('says what a browser without files or folders works on: copies', () => {
    const notice = fileAccessNotice({ files: false, folders: false })!;
    expect(notice.title).toBe('This browser works on copies of your files');
    expect(notice.details).toHaveLength(3);
    expect(notice.details![0]).toMatch(/Open reads a copy .* Save downloads a new file each time/);
    expect(notice.details![1]).toMatch(/Sync folder takes the folder as it is at that moment/);
    expect(notice.details![2]).toMatch(/templates are kept in this browser only: Export/);
  });

  it('speaks only of what is missing', () => {
    expect(fileAccessNotice({ files: true, folders: false })!.details).toHaveLength(2);
    const files = fileAccessNotice({ files: false, folders: true })!;
    expect(files.details).toHaveLength(1);
    expect(files.details![0]).toMatch(/^Open reads a copy/);
  });

  it('reads what the browser can do, not its name', () => {
    // jsdom has none of the pickers.
    expect(browserFileAccess()).toEqual({ files: false, folders: false });
    const w = window as unknown as Record<string, unknown>;
    w.showOpenFilePicker = () => {};
    w.showSaveFilePicker = () => {};
    expect(browserFileAccess()).toEqual({ files: true, folders: false });
    w.showDirectoryPicker = () => {};
    expect(browserFileAccess()).toEqual({ files: true, folders: true });
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
    delete w.showDirectoryPicker;
  });
});

describe('startFileAccessNotice', () => {
  it('tells the user once per session', () => {
    startFileAccessNotice({ files: false, folders: false });
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toMatchObject({
      kind: 'info',
      sticky: true,
      title: 'This browser works on copies of your files',
    });
    expect(window.sessionStorage.getItem(FILE_ACCESS_TOLD_KEY)).toBe('1');
    // A reload of the page, the same session: not again.
    useNoticeStore.getState().clear();
    startFileAccessNotice({ files: false, folders: false });
    expect(notices()).toHaveLength(0);
    // Another session.
    window.sessionStorage.clear();
    startFileAccessNotice({ files: false, folders: false });
    expect(notices()).toHaveLength(1);
  });

  it('says it once when its start is undone and made again, as StrictMode does', () => {
    const stop = startFileAccessNotice({ files: false, folders: false });
    stop();
    expect(notices()).toHaveLength(0);
    expect(window.sessionStorage.getItem(FILE_ACCESS_TOLD_KEY)).toBeNull();
    startFileAccessNotice({ files: false, folders: false });
    expect(notices()).toHaveLength(1);
    expect(window.sessionStorage.getItem(FILE_ACCESS_TOLD_KEY)).toBe('1');
    // A start that told nothing takes nothing back.
    startFileAccessNotice({ files: false, folders: false })();
    expect(notices()).toHaveLength(1);
    expect(window.sessionStorage.getItem(FILE_ACCESS_TOLD_KEY)).toBe('1');
  });

  it('says it once in a browser that keeps no mark of the session', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const stop = startFileAccessNotice({ files: false, folders: false });
    stop();
    startFileAccessNotice({ files: false, folders: false });
    expect(notices()).toHaveLength(1);
    setItem.mockRestore();
  });

  it('says nothing, and marks nothing, in a browser that can do it all', () => {
    startFileAccessNotice({ files: true, folders: true })();
    expect(notices()).toHaveLength(0);
    expect(window.sessionStorage.getItem(FILE_ACCESS_TOLD_KEY)).toBeNull();
  });

  it('stays on screen until it is closed, while a plain notice of its kind fades', () => {
    vi.useFakeTimers();
    render(<NoticeHost />);
    act(() => {
      startFileAccessNotice({ files: false, folders: false });
      notify({ kind: 'info', title: 'Saved' });
    });
    expect(screen.getAllByTestId('notice')).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(AUTO_DISMISS_MS.info! + AUTO_DISMISS_MS.warning!);
    });
    const left = screen.getAllByTestId('notice');
    expect(left).toHaveLength(1);
    expect(left[0]).toHaveTextContent('This browser works on copies of your files');
    act(() => {
      screen.getByTestId('notice-dismiss').click();
    });
    expect(screen.queryByTestId('notice')).not.toBeInTheDocument();
  });
});
