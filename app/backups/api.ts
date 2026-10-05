export async function backupRequest(body: object, signal?: AbortSignal) {
  const response = await fetch('/api/erp/backups', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.message || 'Backup request failed.');
  return result;
}
