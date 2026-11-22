/* The system clipboard: what the page puts on it. */
import { announce } from './announcer';
import { notify } from './project/noticeStore';

/** Put `text` on the system clipboard. Whether it went: a browser refuses a page that is not in
 * a secure context, or that the user did not let write. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copy a colour (`#RRGGBB`) to the system clipboard; a notice gives the colour when the browser
 * refuses, so that it can still be typed. Whether it went. */
export async function copyColour(color: string): Promise<boolean> {
  const copied = await copyText(color);
  if (copied) announce(`${color} copied to the clipboard`);
  else {
    notify({
      kind: 'warning',
      title: 'Could not copy the colour',
      message: `The browser did not let the page write to the clipboard. The colour is ${color}.`,
    });
  }
  return copied;
}
