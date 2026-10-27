/**
 * A hierarchical compile places each recall pair at its summary's start. When
 * a host removed the message a summary's range starts at, the select placed
 * that summary after every newer one, so the oldest memory rendered as the
 * newest (#321). It now sits at its first message still in the store, as
 * compression and merge requests place it.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContextManager, AutobiographicalStrategy } from '../src/index.js';
import type { SummaryEntry } from '../src/types/index.js';

const dir = mkdtempSync(join(tmpdir(), 'removed-first-order-'));
after(() => rmSync(dir, { recursive: true, force: true }));

class Probe extends AutobiographicalStrategy {
  all(): SummaryEntry[] { return [...this.summaries]; }
}

describe('a hierarchical compile after a summary\'s first message is removed', () => {
  it('keeps the summary in its chronological place', async () => {
    let calls = 0;
    const membrane = { complete: async () => ({ stopReason: 'end_turn', content: [{ type: 'text', text: `MEM[${++calls}]` }] }) };
    const strategy = new Probe({
      compressionModel: 'm', hierarchical: true, headWindowTokens: 1, recentWindowTokens: 0, l1HoldbackChunks: 0,
      targetChunkTokens: 60, autoTickOnNewMessage: false, minChunkCharsForLLM: 0, mergeThreshold: 99,
    } as never);
    const manager = await ContextManager.open({ path: join(dir, 'store'), strategy, membrane: membrane as never });
    try {
      const ids: string[] = [];
      for (let i = 0; i < 16; i++) {
        ids.push(manager.addMessage(i % 2 ? 'Claude' : 'User', [{ type: 'text', text: `M${i} ${'word '.repeat(18)}`.slice(0, 110) }]));
      }
      for (let i = 0; i < 20; i++) await manager.tick();
      const summaries = strategy.all().filter((s) => s.level === 1);
      assert.ok(summaries.length >= 3, `setup: several summaries (${summaries.length})`);

      const order = async (): Promise<string[]> => {
        const { messages } = await manager.compile({ maxTokens: 100_000, reserveForResponse: 0 });
        return messages.flatMap((m) => m.content.flatMap((b) => {
          const found = b.type === 'text' ? /^MEM\[\d+\]$/.exec(b.text.trim()) : null;
          return found ? [found[0]] : [];
        }));
      };
      const before = await order();
      assert.equal(before.length, summaries.length, 'setup: each summary renders once');

      // The second summary's first message is removed; its other messages stay.
      const second = summaries.find((s) => s.content === before[1])!;
      assert.ok(second.sourceIds.length > 1, 'setup: the summary keeps messages after the removal');
      manager.removeMessage(second.sourceIds[0]! as never);

      assert.deepEqual(await order(), before, 'the memories render in the order they happened');
    } finally {
      manager.close();
    }
  });
});
