'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Recovery must exit through a document load when the client router is unavailable. */
import { AppBackLink } from '../app-back-link';
import { useState } from 'react';
import ArchiveBrowser from './ArchiveBrowser';
import styles from './backups.module.css';
import OwnerRecovery from './OwnerRecovery';
import { backupRequest as call } from './api';
import { encryptBackup, decryptBackup } from '../lib/backup-format.mjs';
import { makeLocalRecovery, encryptLocalRecovery, decryptLocalRecovery } from '../lib/local-recovery.mjs';

type Backup = { checksum: string; schemaVersion: string[]; tables: Record<string, { columns: string[]; rows: Record<string, string | number | null>[] }> };
type Summary = { new: number; duplicate: number; changed: number; rejected: number; existing: number; canRestore: boolean; numberingCountersIncluded: boolean };
export default function BackupsPage() {
  const [passphrase, setPassphrase] = useState(''); const [backup, setBackup] = useState<Backup | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null); const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const perform = async (action: () => Promise<void>) => { setBusy(true); setMessage('Working…'); try { await action(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Backup operation failed.'); } finally { setBusy(false); } };
  return <main className={styles.page}>
    {/* Leave the standalone recovery page with a document navigation, including when the client router fails. */}
    <AppBackLink/><h1>Backup &amp; Recovery</h1>
    <OwnerRecovery onClearReview={() => { setBackup(null); setSummary(null); setConfirmation(''); }} onReview={async decoded => { setBackup(null); setSummary(null); setConfirmation(''); const result = await call({ operation: 'dry-run', backup: decoded }); setBackup(decoded); setSummary(result.summary); setMessage('Checksum and schema verified. Review the comparison.'); }}/>
    <details><summary>Advanced Recovery — Manual Files and Offline Tools</summary>


    <label>Backup Passphrase (at Least 16 Characters)<input type='password' autoComplete='new-password' value={passphrase} onChange={event => setPassphrase(event.target.value)} style={{ display: 'block', width: '100%', margin: '8px 0' }}/></label>
    <p>Keep this passphrase separately. A lost passphrase cannot be recovered.</p>
    <button type='button' disabled={busy || passphrase.length < 16} onClick={() => void perform(async () => {
      const result = await call({ operation: 'export' }); const encrypted = await encryptBackup(result.backup, passphrase);
      const url = URL.createObjectURL(new Blob([JSON.stringify(encrypted)], { type: 'application/octet-stream' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `seiko-${new Date().toISOString().slice(0, 10)}.seiko-backup`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage('Encrypted download prepared. Check that it was saved to your drive.');
    })}>Download Encrypted Backup</button>
    <h2>Save Available Local Data</h2>

    <button type='button' disabled={busy || passphrase.length < 16} onClick={() => void perform(async () => {
      const copy = await makeLocalRecovery(localStorage); const encrypted = await encryptLocalRecovery(copy, passphrase);
      const url = URL.createObjectURL(new Blob([JSON.stringify(encrypted)], { type: 'application/octet-stream' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `jinam-local-${new Date().toISOString().replace(/[:.]/g, '-')}.jinam-local-recovery`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage(`Encrypted local recovery download prepared: ${Object.keys(copy.entries).length} cached collections. No D1 request was made.`);
    })}>Download Local Recovery Copy</button>
    <ArchiveBrowser passphrase={passphrase}/>
    <h2>Validate a Recovery Copy</h2>
    <label>Encrypted Backup File<input type='file' accept='.seiko-backup,.jinam-local-recovery' disabled={busy} onChange={event => {
      const file = event.target.files?.[0]; setBackup(null); setSummary(null); setConfirmation('');
      if (file) void perform(async () => {
        if (file.size > 24 * 1024 * 1024) throw new Error('Use the local tool for this large backup.');
        const envelope = JSON.parse(await file.text());
        if (envelope.format === 'jinam-encrypted-local-recovery') {
          const local = await decryptLocalRecovery(envelope, passphrase);
          setMessage(`Local recovery verified: ${Object.keys(local.entries).length} cached collections, saved ${local.exportedAt}. This is not a complete D1 snapshot; review it separately. No records changed.`); return;
        }
        const decoded = await decryptBackup(envelope, passphrase);
        const result = await call({ operation: 'dry-run', backup: decoded }); setBackup(decoded); setSummary(result.summary); setMessage('Checksum and schema verified. Review the comparison.');
      });
    }}/></label>
    </details>
    {summary && <><h2>Recovery Preview</h2><p>New: {summary.new} · Duplicates: {summary.duplicate} · Changed: {summary.changed} · Rejected: {summary.rejected} · Existing: {summary.existing}</p>
      {!summary.numberingCountersIncluded && <p>This older archive has no numbering counters. Numbers above the greatest surviving record cannot be recovered; use a newer backup for complete numbering recovery.</p>}
      {summary.canRestore ? <>
        <label>Type RESTORE EMPTY SYSTEM<input value={confirmation} onChange={event => setConfirmation(event.target.value)}/></label>
        <button type='button' disabled={busy || confirmation !== 'RESTORE EMPTY SYSTEM'} onClick={() => void perform(async () => { const result = await call({ operation: 'restore', backup, confirmation }); setMessage(result.message); setSummary(null); setBackup(null); })}>Restore Empty System</button>
      </> : <p>Existing records are protected. Restore this backup into an isolated recovery database for review.</p>}</>}
    <p role='status' aria-live='polite'>{message}</p>
  </main>;
}
