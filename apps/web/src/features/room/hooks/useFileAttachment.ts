import { useEffect, useRef, useState } from 'react';
import { FILE_LIMITS, FileMetadataSchema } from '@screen-room/protocol';
import type { ClipFile } from '../media/local-clip';
import type { FileTransferManager } from '../files/file-transfer-manager';

type Attachment = { blob: Blob; name: string; clip?: ClipFile };
const metadata = FileMetadataSchema.omit({ sha256: true });

/** Room-owned preparation survives closing Chat and switching presentation modes. */
export function useFileAttachment(roomId: string, connected: boolean, manager?: FileTransferManager, clip?: ClipFile | null) {
  const [file, setFile] = useState<Attachment | null>(null);
  const current = useRef<Attachment | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const preparing = useRef<object | null>(null);
  const [error, setError] = useState('');
  const [choosing, setChoosing] = useState(false);
  const version = useRef(0);
  const clear = () => {
    version.current++;
    current.current = null; setFile(null); setSelected([]); setError(''); setChoosing(false);
  };
  useEffect(() => {
    clear(); preparing.current = null; setBusy(false);
    return () => { version.current++; current.current = null; preparing.current = null; };
  }, [roomId, connected, manager]);
  useEffect(() => {
    if (current.current?.clip && current.current.clip !== clip) clear();
  }, [clip]);
  const prepare = (next: Attachment) => {
    if (!connected || preparing.current) return false;
    if (!metadata.safeParse({ name: next.name, mime: next.blob.type, size: next.blob.size }).success) {
      setError(next.blob.size > FILE_LIMITS.maxBytes ? 'O arquivo excede 20 MiB. Escolha um menor.' : 'Nome, tipo ou tamanho de arquivo inválido. Escolha outro arquivo.');
      return false;
    }
    version.current++; current.current = next; setFile(next); setError(''); setChoosing(true);
    return true;
  };
  return {
    file, selected, setSelected, busy, error, setError, choosing, setChoosing, clear, prepare,
    prepareClip(next: ClipFile, own: boolean) {
      if (!own || current.current || preparing.current) return false;
      return prepare({ blob: next.blob, name: `screen-room-${Date.now()}.${next.extension}`, clip: next });
    },
    async offer(targets: string[]) {
      const next = current.current;
      if (!next || !manager || !connected || preparing.current || !targets.length) return false;
      const token = {}; preparing.current = token; setBusy(true); setError('');
      const operation = version.current;
      try {
        await manager.offer(next.blob, next.name, targets);
        if (operation !== version.current) return false;
        clear(); return true;
      } catch (e) {
        if (operation === version.current) setError(e instanceof Error ? e.message : 'Não foi possível preparar o arquivo.');
        return false;
      } finally {
        if (preparing.current === token) { preparing.current = null; setBusy(false); }
      }
    },
  };
}
export type FileAttachmentState = ReturnType<typeof useFileAttachment>;
