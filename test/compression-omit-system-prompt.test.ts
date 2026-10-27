/**
 * L1 and merge requests carry the host's system prompt, which
 * ContextManager.setSystemPrompt keeps as its latest value only, so older
 * history is summarized under the prompt in force at mint time.
 * `compressionOmitSystemPrompt: true` leaves it out of both.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContextManager, AutobiographicalStrategy } from '../src/index.js';
import type { SummaryEntry } from '../src/types/index.js';

const dir = mkdtempSync(join(tmpdir(), 'omit-system-'));
after(() => rmSync(dir, { recursive: true, force: true }));

class Probe extends AutobiographicalStrategy {
  all(): SummaryEntry[] { return [...this.summaries]; }
}

async function run(name: string, omit?: boolean) {
  const requests: Array<{ system?: unknown }> = [];
  let n = 0;
  const membrane = {
    complete: async (request: { system?: unknown }) => {
      requests.push(request);
      return { stopReason: 'end_turn', content: [{ type: 'text', text: `a memory ${++n}` }], usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
  const strategy = new Probe({
    compressionModel: 'm', hierarchical: true, headWindowTokens: 1, recentWindowTokens: 0, l1HoldbackChunks: 0,
    targetChunkTokens: 60, autoTickOnNewMessage: false, minChunkCharsForLLM: 0, mergeThreshold: 2,
    ...(omit !== undefined ? { compressionOmitSystemPrompt: omit } : {}),
  } as never);
  const manager = await ContextManager.open({ path: join(dir, name), strategy, membrane: membrane as never });
  try {
    manager.setSystemPrompt('The prompt the host serves today.');
    for (let i = 0; i < 16; i++) {
      manager.addMessage(i % 2 ? 'Claude' : 'User', [{ type: 'text', text: `M${i} ${'word '.repeat(18)}`.slice(0, 110) }]);
    }
    for (let i = 0; i < 30; i++) await manager.tick();
    assert.ok(strategy.all().some((s) => s.level === 1), 'setup: an L1 was written');
    assert.ok(strategy.all().some((s) => s.level === 2), 'setup: a merge ran');
    return requests;
  } finally {
    manager.close();
  }
}

describe('compressionOmitSystemPrompt', () => {
  it('off (the default), L1 and merge requests carry the latest system prompt', async () => {
    const requests = await run('default');
    assert.ok(requests.length > 0);
    assert.ok(requests.every((r) => r.system === 'The prompt the host serves today.'));
  });

  it('on, neither L1 nor merge requests carry a system prompt', async () => {
    const requests = await run('omit', true);
    assert.ok(requests.length > 0);
    assert.ok(requests.every((r) => !('system' in r)));
  });
});
