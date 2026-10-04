export function releaseState(sha, mainSha, runs) {
  if (mainSha !== sha) throw new Error('This checkout is not the latest GitHub main commit.');
  const latest = runs.filter(run => run.head_sha === sha && run.head_branch === 'main' && run.event === 'push').sort((a, b) => b.id - a.id)[0];
  if (latest?.status !== 'completed') return 'waiting';
  if (latest.conclusion !== 'success') throw new Error('GitHub CI failed; production deployment refused.');
  return 'ready';
}
