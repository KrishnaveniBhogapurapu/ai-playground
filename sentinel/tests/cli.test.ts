import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const entrypoint = fileURLToPath(new URL('../src/index.js', import.meta.url));

test('CLI starts and exits through the application entrypoint without a model request', () => {
  const result = spawnSync(process.execPath, [entrypoint], {
    input: '/exit\n', encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: 'unused-test-value' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sentinel CLI/);
  assert.match(result.stdout, /You:/);
  assert.ok(!result.stdout.includes('unused-test-value'));
});

test('CLI startup preserves the typed missing-configuration failure', () => {
  const result = spawnSync(process.execPath, [entrypoint], {
    encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: '' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.accepted, false);
  assert.equal(failure.failure.code, 'missing-configuration');
  assert.equal(failure.failure.category, 'configuration');
});
