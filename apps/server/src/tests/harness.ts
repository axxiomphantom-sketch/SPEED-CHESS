/** Minimal test harness — no external runner, deterministic output, non-zero exit on failure. */
let passed = 0;
let failed = 0;
const failures: string[] = [];
let currentSuite = '';

export function suite(name: string, fn: () => void) {
  currentSuite = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
  fn();
}

export function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) throw new Error('async tests must use testAsync');
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${currentSuite} › ${name}: ${(err as Error).message}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${(err as Error).message}`);
  }
}

const pending: Array<Promise<void>> = [];

export function testAsync(name: string, fn: () => Promise<void>) {
  pending.push((async () => {
    try {
      await fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    } catch (err) {
      failed++;
      failures.push(`${currentSuite} › ${name}: ${(err as Error).message}`);
      console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${(err as Error).message}`);
    }
  })());
}

export async function flush() {
  await Promise.all(pending);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEqual<T>(actual: T, expected: T, message = '') {
  if (actual !== expected) throw new Error(`${message} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function assertClose(actual: number, expected: number, tolerance: number, message = '') {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${message} expected ≈${expected} ±${tolerance}, got ${actual}`);
}

export function report() {
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  • ${f}`);
    process.exitCode = 1;
  }
  return failed === 0;
}
