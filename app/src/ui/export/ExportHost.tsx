/* Mounts the export dialog the Export button asked for (`openExportDialog`). */
import { useExportDialog } from './exportStore';
import { PythonExportDialog } from './PythonExportDialog';
import { AudioExportDialog } from './AudioExportDialog';
import { HtmlExportDialog } from './HtmlExportDialog';
import { ImageExportDialog } from './ImageExportDialog';
import { VideoExportDialog } from './VideoExportDialog';

export function ExportHost() {
  const request = useExportDialog((s) => s.request);
  const close = useExportDialog((s) => s.close);
  if (!request) return null;
  return request.kind === 'python' ? (
    <PythonExportDialog key={request.target} target={request.target} onClose={close} />
  ) : request.kind === 'audio' ? (
    <AudioExportDialog onClose={close} />
  ) : request.kind === 'html' ? (
    <HtmlExportDialog onClose={close} />
  ) : request.kind === 'image' ? (
    <ImageExportDialog onClose={close} />
  ) : (
    <VideoExportDialog onClose={close} />
  );
}
