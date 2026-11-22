/** Original media is document content. Storage failures must never become a cache miss. */
export type MediaErrorCode =
  | 'unavailable'
  | 'quota'
  | 'transaction'
  | 'missing'
  | 'corrupt'
  | 'cancelled'
  | 'too-large'
  /** A file that is whole and that this app does not open (`UnopenedProjectError`). */
  | 'unsupported';

export class MediaStorageError extends Error {
  readonly code: MediaErrorCode;

  constructor(code: MediaErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'MediaStorageError';
    this.code = code;
  }
}

/** A package whose container is whole and whose project this app does not open: one saved by a
 * newer version of the app, one with a field out of place. `message` is the project's own reason,
 * in the words a `.mfe.json` gets (`parseProject`), and `details` what it adds — the file is not
 * damaged, and saying so would send its owner after the wrong thing. */
export class UnopenedProjectError extends MediaStorageError {
  readonly details: readonly string[];

  constructor(message: string, details: readonly string[] = []) {
    super('unsupported', message);
    this.name = 'UnopenedProjectError';
    this.details = details;
  }
}

export function storageError(error: unknown): MediaStorageError {
  if (error instanceof MediaStorageError) return error;
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'QuotaExceededError') {
    return new MediaStorageError(
      'quota',
      'The browser has no space for project source data. Free browser storage or use a smaller source.',
      error,
    );
  }
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return new MediaStorageError(
      'unavailable',
      'The browser cannot keep project source data here. Enable local storage and try again.',
      error,
    );
  }
  return new MediaStorageError(
    'transaction',
    'Project source data could not be stored or read.',
    error,
  );
}

export function checkMediaAbort(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new MediaStorageError('cancelled', 'The media operation was cancelled.');
}
