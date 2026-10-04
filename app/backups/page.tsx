'use client';
import { useState } from 'react';
import Link from 'next/link';
import { encryptBackup, decryptBackup } from '../lib/backup-format.mjs';

type Backup = { checksum: string; schemaVersion: string[]; tables: Record<string, { columns: string[]; rows: Record<string, string | number | null>[] }> };
type Summary = { new: number; duplicate: number; changed: number; rejected: number; existing: number; canRestore: boolean };
async function call(body: object) {
  const response = await fetch('/api/erp/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.message || 'Backup request failed.'); return result;
}
export default function BackupsPage() {
  const [passphrase, setPassphrase] = useState(''); const [backup, setBackup] = useState<Backup | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null); const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const perform = async (action: () => Promise<void>) => { setBusy(true); setMessage('Working…'); try { await action(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Backup operation failed.'); } finally { setBusy(false); } };
  return <main style={{ maxWidth: 840, margin: '32px auto', padding: 24 }}>
    <Link href='/'>← Back to Home</Link><h1>Backup &amp; recovery</h1>
    <p>Download an encrypted system backup to this PC, then keep a second encrypted copy in your private Google Drive folder. Owner access to all three businesses is required.</p>
    <p>Includes orders, clients, products stored in shared collections, documents, payments, labels, settings and operational histories. Accounts, passwords, sessions, passkeys and connector secrets are excluded. Unsynced browser drafts must be saved separately.</p>
    <label>Backup passphrase (at least 16 characters)<input type='password' autoComplete='new-password' value={passphrase} onChange={event => setPassphrase(event.target.value)} style={{ display: 'block', width: '100%', margin: '8px 0' }}/></label>
    <p>Keep this passphrase separately. A lost passphrase cannot be recovered.</p>
    <button type='button' disabled={busy || passphrase.length < 16} onClick={() => void perform(async () => {
      const result = await call({ operation: 'export' }); const encrypted = await encryptBackup(result.backup, passphrase);
      const url = URL.createObjectURL(new Blob([JSON.stringify(encrypted)], { type: 'application/octet-stream' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `seiko-${new Date().toISOString().slice(0, 10)}.seiko-backup`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage('Encrypted download prepared. Check that it was saved to your drive.');
    })}>Download encrypted backup</button>
    <h2>Validate a recovery copy</h2><p>Select an encrypted backup and enter its passphrase. Validation compares it with current storage and changes no business records.</p>
    <label>Encrypted backup file<input type='file' accept='.seiko-backup' disabled={busy} onChange={event => {
      const file = event.target.files?.[0]; setBackup(null); setSummary(null); setConfirmation('');
      if (file) void perform(async () => {
        if (file.size > 24 * 1024 * 1024) throw new Error('Use the local tool for this large backup.');
        const decoded = await decryptBackup(JSON.parse(await file.text()), passphrase);
        const result = await call({ operation: 'dry-run', backup: decoded }); setBackup(decoded); setSummary(result.summary); setMessage('Checksum and schema verified. Review the comparison.');
      });
    }}/></label>
    {summary && <><p>New: {summary.new} · Duplicates: {summary.duplicate} · Changed: {summary.changed} · Rejected: {summary.rejected} · Existing: {summary.existing}</p>
      {summary.canRestore ? <><p>Restore is available only into an empty business database. Sign in again first; your ERP session must be less than ten minutes old.</p>
        <label>Type RESTORE EMPTY SYSTEM<input value={confirmation} onChange={event => setConfirmation(event.target.value)}/></label>
        <button type='button' disabled={busy || confirmation !== 'RESTORE EMPTY SYSTEM'} onClick={() => void perform(async () => { const result = await call({ operation: 'restore', backup, confirmation }); setMessage(result.message); setSummary(null); setBackup(null); })}>Restore empty system</button>
      </> : <p>Existing records are protected. Restore this backup into an isolated recovery database for review.</p>}</>}
    <p role='status' aria-live='polite'>{message}</p>
  </main>;
}
