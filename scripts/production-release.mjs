import { spawnSync } from 'node:child_process';
import { releaseState } from './release-state.mjs';

const repo = 'jinampanc-pixel/seiko-system-v2';
const git = (...args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot verify committed release state.');
  return result.stdout.trim();
};
const sha = git('rev-parse', 'HEAD');
if (git('status', '--porcelain')) throw new Error('Production deployment requires clean committed state.');
const read = async resource => {
  const response = await fetch(`https://api.github.com/repos/${repo}/${resource}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'seiko-production-release' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Cannot verify GitHub CI; production deployment refused.');
  return response.json();
};
const deadline = Date.now() + 10 * 60 * 1000;
for (;;) {
  const main = await read('git/ref/heads/main');
  const runs = await read(`actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&branch=main&per_page=5`);
  if (releaseState(sha, main.object.sha, runs.workflow_runs) === 'ready') {
    console.log(`Verified successful CI for ${sha}.`); break;
  }
  if (Date.now() >= deadline) throw new Error('CI did not finish within ten minutes; deployment refused.');
  console.log('Waiting for GitHub CI before migration and deployment…');
  await new Promise(resolve => setTimeout(resolve, 20000));
}
// The export must succeed before any schema change; a failed migration prevents deployment.
for (const args of [['scripts/d1-migrations.mjs', '--remote'], ['node_modules/wrangler/bin/wrangler.js', 'deploy']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw new Error('Production release stopped before completion.');
}
