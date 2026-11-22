/* What the app cannot do with the user's files in a browser without the File System Access API
 * (Firefox, Safari): it works on copies. Said once per session, when the app opens, in a notice
 * that stays until it is closed — the menus look the same there, and nothing else tells that
 * Save does not write the file that was opened. Decided by what the browser can do, not by its
 * name. */
import { safeSession } from '../storage';
import { hasDirectoryPicker, hasFileSystemAccess } from './files';
import { notify, useNoticeStore, type Notice } from './noticeStore';

/** sessionStorage: this session was told. */
export const FILE_ACCESS_TOLD_KEY = 'mfe.fileAccess.told';

export interface FileAccess {
  /** A file can be opened and saved in place (`showOpenFilePicker`, `showSaveFilePicker`). */
  files: boolean;
  /** A folder can be kept and listed again, and written (`showDirectoryPicker`). */
  folders: boolean;
}

export function browserFileAccess(): FileAccess {
  return { files: hasFileSystemAccess(), folders: hasDirectoryPicker() };
}

/** What to tell the user of a browser with this access; null when it can do everything. */
export function fileAccessNotice(
  access: FileAccess,
): Pick<Notice, 'title' | 'message' | 'details'> | null {
  if (access.files && access.folders) return null;
  const details: string[] = [];
  if (!access.files) {
    details.push(
      'Open reads a copy of the file you choose, and Save downloads a new file each time: the file you opened is not written.',
    );
  }
  if (!access.folders) {
    details.push(
      'Sync folder takes the folder as it is at that moment: it is not read again until you sync it again, and nothing is written into it.',
      'Your templates are kept in this browser only: Export takes them elsewhere.',
    );
  }
  return {
    title: 'This browser works on copies of your files',
    message:
      'It gives the editor no way to write a file or a folder of your disk (Chrome and Edge do).',
    details,
  };
}

/** Tell the user what this browser cannot do, unless the session was told already. Started once,
 * when the app starts. The result takes the word back — the notice, and the mark of the session
 * —, so that a start that is undone and made again (React's StrictMode in development) says it
 * once, whether or not the browser keeps the mark. */
export function startFileAccessNotice(access: FileAccess = browserFileAccess()): () => void {
  const notice = fileAccessNotice(access);
  if (!notice || safeSession.getItem(FILE_ACCESS_TOLD_KEY) !== null) return () => {};
  safeSession.setItem(FILE_ACCESS_TOLD_KEY, '1');
  const id = notify({ kind: 'info', sticky: true, ...notice });
  return () => {
    safeSession.removeItem(FILE_ACCESS_TOLD_KEY);
    useNoticeStore.getState().dismiss(id);
  };
}
