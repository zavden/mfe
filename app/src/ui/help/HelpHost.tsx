/* Mounts the open Help dialog (helpStore). */
import { AboutDialog } from './AboutDialog';
import { closeHelpDialog, useHelpDialog } from './helpStore';
import { ShortcutsDialog } from './ShortcutsDialog';
import { ThirdPartyDialog } from './ThirdPartyDialog';

export function HelpHost() {
  const open = useHelpDialog((s) => s.open);
  if (open === 'shortcuts') return <ShortcutsDialog onClose={closeHelpDialog} />;
  if (open === 'about') return <AboutDialog onClose={closeHelpDialog} />;
  if (open === 'licenses') return <ThirdPartyDialog onClose={closeHelpDialog} />;
  return null;
}
