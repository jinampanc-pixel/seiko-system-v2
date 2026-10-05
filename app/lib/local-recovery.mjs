import { checksum, encryptPayload, decryptPayload } from './backup-format.mjs';

// Operational caches only. Do not sweep all browser storage into a recovery file.
const businessKey = /^jinam:(seiko|meth|veyn-health):(?:orders-v1|erp-conflict(?:-active)?:.*|generated-order-artifacts-v1|scan-queue|library:(clients|products):v1|billing:(documents|payments|templates):v1|labels:(?:tasks-v1|templates-v1|layouts-v2|presets-v1|shared-pending-v1|browser-adoption-backup-v1|classification:.*)|packing-person-(?:presentation|package-layout):.*)$/;
const forbidden = /(?:password|secret|credential|session|oauth|access-token|refresh-token|passkey|channel-connection)/i;
export async function makeLocalRecovery(storage, now = new Date()) {
  const entries = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && businessKey.test(key) && !forbidden.test(key)) entries[key] = storage.getItem(key);
  }
  if (!Object.keys(entries).length) throw new Error('No supported local business data is available in this browser.');
  const payload = { format: 'jinam-browser-recovery', version: 1, exportedAt: now.toISOString(), completeD1Snapshot: false, source: 'local-cache-and-pending-changes', entries };
  return { ...payload, checksum: await checksum(payload) };
}
export async function encryptLocalRecovery(copy, password) {
  await validateLocalRecovery(copy);
  return encryptPayload(copy, password, 'jinam-encrypted-local-recovery', 'JINAM-LOCAL-RECOVERY-1');
}
async function validateLocalRecovery(copy) {
  if (!copy || copy.format !== 'jinam-browser-recovery' || copy.version !== 1 || copy.completeD1Snapshot !== false || !copy.entries || !Object.keys(copy.entries).length || Object.entries(copy.entries).some(([key, value]) => !businessKey.test(key) || forbidden.test(key) || typeof value !== 'string')) throw new Error('Invalid local recovery copy.');
  const { checksum: digest, ...payload } = copy;
  if (digest !== await checksum(payload)) throw new Error('Local recovery checksum does not match.');
  return copy;
}
export async function decryptLocalRecovery(envelope, password) {
  return validateLocalRecovery(await decryptPayload(envelope, password, 'jinam-encrypted-local-recovery', 'JINAM-LOCAL-RECOVERY-1'));
}
