import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function legacySharedUpgrade(columns) {
  if (!columns.length) return [];
  const names = new Set(columns.map(column => column.name));
  const statements = [];
  if (!names.has('version')) statements.push('ALTER TABLE jinam_shared_records ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  if (!names.has('created_at')) statements.push('ALTER TABLE jinam_shared_records ADD COLUMN created_at TEXT');
  statements.push('UPDATE jinam_shared_records SET created_at = updated_at WHERE created_at IS NULL');
  return statements;
}

export function migrate(args = process.argv.slice(2), runProcess = spawnSync) {
  if (args.length !== 1 || !['--local', '--remote'].includes(args[0])) throw new Error('Specify exactly --local or --remote.');
  const target = args[0];
  const cli = path.resolve('node_modules/wrangler/bin/wrangler.js');
  const run = (command, json = false, quiet = false) => {
    const storage = target === '--local' && process.env.SEIKO_D1_LOCAL_DIR ? ['--persist-to', process.env.SEIKO_D1_LOCAL_DIR] : [];
    const result = runProcess(process.execPath, [cli, ...command, '--config', 'wrangler.jsonc', ...storage], { encoding: 'utf8', env: { ...process.env, CI: 'true' }, stdio: json || quiet ? 'pipe' : 'inherit' });
    if (result.status !== 0) throw new Error('D1 command failed; deployment must stop.');
    return json ? JSON.parse(result.stdout) : null;
  };
  // Never publish a full database export as a public CI artifact: it contains PII and auth records.
  if (target === '--remote') {
    const directory = process.env.SEIKO_D1_BACKUP_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'seiko-d1-before-migration-'));
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const filename = path.join(directory, `database-${Date.now()}.sql`);
    // Wrangler prints a signed download URL. Capture it instead of leaking a full export into public CI logs.
    run(['d1', 'export', 'DB', '--remote', '--output', filename], false, true);
    const data = fs.readFileSync(filename);
    if (!data.length || !data.includes(Buffer.from('CREATE TABLE'))) throw new Error('D1 export is empty or incomplete; migrations refused.');
    const manifest = { exportedAt: new Date().toISOString(), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
    fs.writeFileSync(`${filename}.manifest.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    fs.chmodSync(filename, 0o600);
    console.log(`Pre-migration export verified (${manifest.bytes} bytes, SHA-256 ${manifest.sha256}).`);
  }
  const result = run(['d1', 'execute', 'DB', target, '--command', 'PRAGMA table_info(jinam_shared_records)', '--json'], true);
  const statements = legacySharedUpgrade(result.flatMap(item => item.results || []));
  if (statements.length) run(['d1', 'execute', 'DB', target, '--command', statements.join('; ')]);
  run(['d1', 'migrations', 'apply', 'DB', target]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) migrate();
