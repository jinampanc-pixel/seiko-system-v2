'use client';
import { useEffect, useState } from 'react';
import { backupRequest } from './api';
import ArchiveBrowser from './ArchiveBrowser';

type Backup = { checksum: string; exportedAt: string; schemaVersion: string[]; tables: Record<string, { columns: string[]; rows: Record<string, string | number | null>[] }> };
type Copy = { location: string; verifiedAt: string; file: string; encryptedBytes: number; records: number };
type Status = { managedRecoveryReady: boolean; orders: number; records: number; databaseBytes: number | null; copies: Copy[] };
export default function OwnerRecovery({ onReview, onClearReview }: { onReview: (backup: Backup) => Promise<void>; onClearReview: () => void }) {
  const [status, setStatus] = useState<Status | null>(null); const [message, setMessage] = useState('Checking owner access and backup receipts…');
  const [busy, setBusy] = useState(false); const [selected, setSelected] = useState<Backup | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    backupRequest({ operation: 'status' }, controller.signal).then(result => { setStatus(result); setMessage('Backup status checked. Copy dates below are the last reported verification, not a check of the files right now.'); }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, []);
  const perform = async (work: () => Promise<void>) => { setBusy(true); try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Recovery request failed.'); } finally { setBusy(false); } };
  const unlock = async (envelope: object) => (await backupRequest({ operation: 'managed-inspect', envelope })).backup;
  return <section aria-label='Owner backup status'>
    <h2>Backup status</h2>
    <p>Your normal order search stays in Order Center. Recovery is for missing data; it does not replace or clear current orders.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
      <article><h3>Shared database</h3><p>{status ? `${status.orders} orders · ${status.records} business records` : 'Checking…'}</p>{status?.databaseBytes != null && <p>{(status.databaseBytes / 1000000).toFixed(1)} MB in use</p>}</article>
      {['pc', 'drive'].map(location => {
        const copy = status?.copies.find(item => item.location === location);
        return <article key={location}><h3>{location === 'pc' ? 'PC backup' : 'Google Drive backup'}</h3><p>{copy ? `Last verified ${new Date(copy.verifiedAt).toLocaleString()}` : 'No verified copy reported yet'}</p>{copy && <p>{copy.records} records · {(copy.encryptedBytes / 1000000).toFixed(1)} MB</p>}</article>;
      })}
      <article><h3>Other owner devices</h3><p>Signing in alone does not save a backup. Use Download backup on each device you want to keep a copy.</p></article>
    </div>
    <p>{status?.managedRecoveryReady ? 'Owner recovery is enabled. Sign in again if asked; no backup passphrase is needed for copies made with the managed key.' : 'Managed recovery is awaiting protected key setup. Existing encrypted backups remain safe; these actions will enable after setup.'}</p>
    <button disabled={busy || !status?.managedRecoveryReady} onClick={() => void perform(async () => {
      const result = await backupRequest({ operation: 'managed-export' });
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.envelope)], { type: 'application/octet-stream' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `seiko-${new Date().toISOString().replace(/[:.]/g, '-')}.seiko-backup`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage('Encrypted backup download prepared. Check Downloads on this device before relying on this copy.');
    })}>Download backup</button>
    {status?.managedRecoveryReady && <>
      <h2>Recover data</h2><p>Select a saved backup from this PC or a copy downloaded from Drive. Owner access unlocks it; previewing changes no records.</p>
      <label>Backup to recover<input type='file' accept='.seiko-backup' disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; setSelected(null); onClearReview();
        if (file) void perform(async () => { if (file.size > 16 * 1024 * 1024) throw new Error('This backup exceeds the owner recovery request limit. Use Advanced recovery for offline review.'); const backup = await unlock(JSON.parse(await file.text())); setSelected(backup); setMessage('Backup unlocked and verified. Review recovery before changing any records.'); });
      }}/></label>
      {selected && <><p>Saved {new Date(selected.exportedAt).toLocaleString()} · {selected.tables.erp_orders.rows.length} orders</p><button disabled={busy} onClick={() => void perform(() => onReview(selected))}>Review recovery</button></>}
      <ArchiveBrowser passphrase='' unlock={unlock}/>
    </>}
    <p role='status' aria-live='polite'>{message}</p>
  </section>;
}
