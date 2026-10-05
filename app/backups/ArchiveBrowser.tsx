'use client';
import { useMemo, useRef, useState } from 'react';
import { decryptBackup } from '../lib/backup-format.mjs';

type Row = Record<string, string | number | null>;
type Archive = { name: string; exportedAt: string; tables: Record<string, { rows: Row[] }> };
const names: Record<string, string> = { erp_orders: 'Orders', erp_audit_events: 'Order history', erp_preferences: 'Settings', seiko_clients: 'Clients', seiko_billing_documents: 'Documents', seiko_billing_payments: 'Payments', erp_label_records: 'Labels', erp_label_history: 'Label history', seiko_storage_audit: 'Billing history', jinam_shared_records: 'Shared collections', jinam_shared_changes: 'Collection history', jinam_meth_finished_stock: 'Stock', jinam_meth_fulfilment_settings: 'Fulfilment settings', jinam_meth_order_routing_claims: 'Routing claims' };
function readable(value: string | number | null) {
  if (typeof value !== 'string') return String(value ?? '—');
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}
export default function ArchiveBrowser({ passphrase, unlock }: { passphrase: string; unlock?: (envelope: object) => Promise<Archive> }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [archives, setArchives] = useState<Archive[]>([]);
  const [query, setQuery] = useState(''); const [collection, setCollection] = useState('erp_orders');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const matches = useMemo(() => archives.flatMap(archive => (archive.tables[collection]?.rows || [])
    .filter(row => JSON.stringify(row).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .map((row, index) => ({ archive, row, index }))), [archives, collection, query]);
  return <section aria-label='Search saved archives'>
    <h2>Search saved archives</h2>
    <p>Open encrypted copies from this device or downloaded from Drive. Search old orders and other records without changing the live database. {unlock ? 'Owner authentication unlocks files through Jinam’s secure recovery service. Files are sent to that service for decryption.' : 'Files are unlocked on this device and are not uploaded.'} A snapshot shows data as it was on its backup date.</p>
    <label>Archives to search<input ref={fileInput} type='file' multiple accept='.seiko-backup' disabled={busy || (!unlock && passphrase.length < 16)} onChange={event => {
      const files = Array.from(event.target.files || []); setArchives([]); setMessage(''); setQuery('');
      if (!files.length) return;
      setBusy(true);
      void (async () => {
        try {
          if (files.reduce((size, file) => size + file.size, 0) > 48 * 1024 * 1024) throw new Error('Open fewer archives at once (48 MB maximum).');
          const decoded: Archive[] = [];
          for (const file of files) {
            if (unlock && file.size > 16 * 1024 * 1024) throw new Error('Use Advanced recovery for offline browsing of archives larger than 16 MB.');
            const envelope = JSON.parse(await file.text());
            decoded.push({ ...(unlock ? await unlock(envelope) : await decryptBackup(envelope, passphrase)), name: file.name });
          }
          setArchives(decoded); setMessage(`${decoded.length} verified archive(s) ready to search. No live records changed.`);
        } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Archive could not be opened.'); }
        finally { setBusy(false); }
      })();
    }}/></label>
    <p role='status'>{message}</p>
    {archives.length > 0 && <>
      <button type='button' onClick={() => { setArchives([]); setQuery(''); if (fileInput.current) fileInput.current.value = ''; setMessage('Archives closed.'); }}>Close archives</button>
      <label>Record type<select value={collection} onChange={event => setCollection(event.target.value)}>{Object.entries(names).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Search archive records<input type='search' placeholder='Order number, customer, person or any saved value' value={query} onChange={event => setQuery(event.target.value)}/></label>
      <p>{matches.length} matching records{matches.length > 50 ? ' · Showing first 50; narrow your search' : ''}</p>
      {matches.slice(0, 50).map(({ archive, row, index }, resultIndex) => <details key={`${archive.name}:${resultIndex}`} style={{ margin: '12px 0', padding: 12, border: '1px solid #ccd5dc', borderRadius: 8 }}>
        <summary>{String(row.order_number || row.id || row.sequence || row.key || row.meth_sku || index + 1)} · {archive.name} · Saved {archive.exportedAt}</summary>
        <dl>{Object.entries(row).map(([key, value]) => <div key={key}><dt style={{ fontWeight: 600 }}>{key.replaceAll('_', ' ')}</dt><dd style={{ margin: '4px 0 12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{readable(value)}</dd></div>)}</dl>
      </details>)}
    </>}
  </section>;
}
