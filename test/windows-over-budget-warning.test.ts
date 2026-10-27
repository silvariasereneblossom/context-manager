/**
 * A budget that can't hold the raw head and recent windows refuses every
 * compile once the conversation outgrows them (the default 30k recent window
 * under a 32k model's budget, say). The strategy says so at the first
 * committing compile at such a budget, once, while compiles still succeed.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContextManager, AutobiographicalStrategy } from '../src/index.js';

const dir = mkdtempSync(join(tmpdir(), 'windows-over-budget-'));
after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
async function open(config: Record<string, unknown> = {}) {
  const strategy = new AutobiographicalStrategy({ compressionModel: 'm', autoTickOnNewMessage: false, ...config } as never);
  const manager = await ContextManager.open({ path: join(dir, `store-${n++}`), strategy });
  manager.addMessage('User', [{ type: 'text', text: 'Hello!' }]);
  manager.addMessage('Claude', [{ type: 'text', text: 'Hi.' }]);
  return manager;
}

async function warnings(body: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const { error } = console;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try { await body(); } finally { console.error = error; }
  return lines.filter((line) => line.includes('configuration error: recentWindowTokens'));
}

const SMALL = { maxTokens: 32_000, reserveForResponse: 4_000 };

describe('a budget that cannot hold the raw windows', () => {
  it('is named at the first compile, once, while the compile still succeeds', async () => {
    const manager = await open({ headWindowTokens: 1_000 });
    try {
      const lines = await warnings(async () => {
        const { messages } = await manager.compile(SMALL);
        assert.equal(messages.length, 2, 'a short conversation still compiles');
        await manager.compile(SMALL);
      });
      assert.equal(lines.length, 1, 'said once for this budget');
      assert.match(lines[0]!, /recentWindowTokens \(30000\) and headWindowTokens \(1000\) stay raw and don't fit this compile's input budget of 28000 \(maxTokens 32000 less reserveForResponse 4000\)/);
      assert.match(lines[0]!, /lower recentWindowTokens or headWindowTokens, or raise the budget/);
    } finally {
      manager.close();
    }
  });

  it('is not named for a budget that holds them, a dry compile, or with enforceBudget off', async () => {
    const fits = await open();
    const loose = await open({ enforceBudget: false });
    try {
      const lines = await warnings(async () => {
        await fits.compile({ maxTokens: 40_000, reserveForResponse: 4_000 });
        await fits.compile(SMALL, undefined, { dryRun: true });
        await loose.compile(SMALL);
      });
      assert.deepEqual(lines, []);
    } finally {
      fits.close();
      loose.close();
    }
  });
});
