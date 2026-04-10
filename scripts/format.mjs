import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(repoRoot, '..', 'backend');
const args = process.argv.slice(2);
const checkMode = args.includes('--check');

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? path.join(repoRoot, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (checkMode) {
  run('npx', ['prettier', '--check', '.']);
  run('uv', ['run', 'python', '-m', 'ruff', 'format', '--check', '.'], {
    cwd: backendDir,
  });
} else {
  run('npx', ['prettier', '--write', '.']);
  run('uv', ['run', 'python', '-m', 'ruff', 'format', '.'], {
    cwd: backendDir,
  });
}
