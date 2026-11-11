// Runs the API server and the Vite dev server together.
import { spawn } from 'node:child_process';
const procs = [
  ['server', ['-w', '@speed-chess/server', 'run', 'dev']],
  ['web', ['-w', '@speed-chess/web', 'run', 'dev']],
];
const children = procs.map(([name, args]) => {
  const p = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = name.toUpperCase().padEnd(6);
  p.stdout.on('data', d => process.stdout.write(d.toString().split('\n').filter(Boolean).map(l => `[${tag}] ${l}\n`).join('')));
  p.stderr.on('data', d => process.stderr.write(d.toString().split('\n').filter(Boolean).map(l => `[${tag}] ${l}\n`).join('')));
  p.on('exit', c => console.log(`[${tag}] exited ${c}`));
  return p;
});
const shutdown = () => { children.forEach(c => c.kill('SIGTERM')); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
