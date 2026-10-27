/**
 * A chunk the summarizer refuses through its whole ladder is covered by a
 * placeholder L1 written without a model call (compressionRefusalPlaceholder,
 * on unless set to false), so compression goes on past it and compiles keep
 * fitting. The quarantine record stays, for the operator. Before, the chunk
 * stayed raw until an operator cleared its record, and a summarizer that
 * refused every chunk left the whole middle raw, so compiles were refused.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContextManager, AutobiographicalStrategy, OverBudgetError, UncoveredDropError } from '../src/index.js';
import type { SummaryEntry } from '../src/types/index.js';

const dir = mkdtempSync(join(tmpdir(), 'refusal-placeholder-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const CONFIG = {
  compressionModel: 'same-model', targetChunkTokens: 300, recentWindowTokens: 300, headWindowTokens: 0,
  autoTickOnNewMessage: false, minChunkCharsForLLM: 0, mergeThreshold: 99, compressionRefusalCurveFallbacks: 0,
  quarantineAlarmIntervalMs: 0,
};

class Probe extends AutobiographicalStrategy {
  all(): SummaryEntry[] { return [...this.summaries]; }
  alarm(): Promise<void> {
    return (this as unknown as { soundQuarantineAlarmIfNeeded(): Promise<void> }).soundQuarantineAlarmIfNeeded();
  }
}

let calls = 0;
const refusing = {
  complete: async () => {
    calls += 1;
    return { content: [], stopReason: 'refusal', usage: { inputTokens: 100, outputTokens: 0 } };
  },
} as never;

async function quietly<T>(body: () => Promise<T>): Promise<T> {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try { return await body(); } finally { console.warn = warn; console.error = error; }
}

async function open(name: string, config: Record<string, unknown> = {}) {
  const strategy = new Probe({ ...CONFIG, ...config } as never);
  const manager = await ContextManager.open({ path: join(dir, name), strategy, membrane: refusing });
  return { strategy, manager };
}

function addMessages(manager: ContextManager, count: number, from = 0): void {
  for (let i = from; i < from + count; i++) {
    manager.addMessage(i % 2 ? 'Claude' : 'User', [{ type: 'text', text: `msg-${i} ${'something personal and long '.repeat(12)}` }]);
  }
}

async function drain(manager: ContextManager, ticks = 80): Promise<void> {
  await quietly(async () => { for (let i = 0; i < ticks; i++) await manager.tick(); });
}

const BUDGET = { maxTokens: 3_000, reserveForResponse: 0 };
const text = (messages: { content: { type: string; text?: string }[] }[]): string =>
  messages.flatMap((m) => m.content.map((b) => (b.type === 'text' ? b.text ?? '' : ''))).join('\n');

describe('a summarizer that refuses every chunk', () => {
  it('leaves placeholders, so compiles keep fitting over many chunks, and the quarantine records stay', async () => {
    const { strategy, manager } = await open('default');
    try {
      addMessages(manager, 80);
      await drain(manager);
      const placeholders = strategy.all().filter((s) => s.level === 1);
      assert.ok(placeholders.length >= 10, `many chunks were refused and covered (${placeholders.length})`);
      assert.ok(placeholders.every((s) => s.placeholder === 'compression-exhausted'), 'each L1 is a marked placeholder');
      assert.match(placeholders[0]!.content, /^\(A stretch I couldn't form a memory of: \d+ messages from \d{4}-\d\d-\d\d \d\d:\d\d UTC to /);
      assert.match(placeholders[0]!.content, /The original messages remain in the archive\.\)$/);

      const { messages } = await manager.compile(BUDGET);
      assert.match(text(messages as never), /A stretch I couldn't form a memory of/);
      assert.doesNotMatch(text(messages as never), /msg-0 /, 'the refused messages are not sent raw');

      const status = strategy.getCompressionQuarantineStatus();
      assert.equal(status.spans.length, placeholders.length, 'every refused span keeps its record');
      assert.ok(status.spans.every((span) => span.placeholderSummaryId !== undefined), 'each span names its placeholder');
    } finally {
      manager.close();
    }
  });

  it('without placeholders (the control), leaves the middle raw and the compile is refused', async () => {
    const { manager } = await open('control', { compressionRefusalPlaceholder: false });
    try {
      addMessages(manager, 80);
      await drain(manager);
      await assert.rejects(
        quietly(() => manager.compile(BUDGET)),
        (err: unknown) => err instanceof OverBudgetError || err instanceof UncoveredDropError,
      );
    } finally {
      manager.close();
    }
  });

  it('covers a chunk quarantined before placeholders were on at its next attempt, with no call', async () => {
    const first = await open('upgrade', { compressionRefusalPlaceholder: false });
    addMessages(first.manager, 24);
    await drain(first.manager, 1);
    assert.equal(first.strategy.getCompressionQuarantineStatus().spans.length, 1, 'setup: one quarantined chunk');
    assert.equal(first.strategy.all().length, 0, 'setup: it stays raw');
    first.manager.close();

    const second = await open('upgrade');
    try {
      const before = calls;
      await drain(second.manager, 1);
      assert.equal(calls, before, 'the quarantined chunk is covered without a model call');
      const [placeholder] = second.strategy.all();
      assert.equal(placeholder?.placeholder, 'compression-exhausted');
      assert.equal(second.strategy.getCompressionQuarantineStatus().spans[0]?.placeholderSummaryId, placeholder?.id);
    } finally {
      second.manager.close();
    }
  });

  it("keeps a placeholder's record through the paid-off sweep, and the alarm names the placeholder", async () => {
    const { strategy, manager } = await open('sweep', { quarantineAlarmIntervalMs: 3_600_000 });
    try {
      addMessages(manager, 24);
      await drain(manager, 1);
      const [placeholder] = strategy.all();
      assert.ok(placeholder?.placeholder, 'setup: a placeholder');
      const lines: string[] = [];
      const { error } = console;
      console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
      try { await strategy.alarm(); } finally { console.error = error; }
      assert.equal(strategy.getCompressionQuarantineStatus().count, 1, 'the sweep keeps the record');
      const line = lines.find((l) => l.startsWith('[compression-quarantine] ⚠️'));
      assert.ok(line?.includes(`placeholder ${placeholder!.id}`), line);
      assert.ok(line?.includes('covered by a placeholder summary'), line);
    } finally {
      manager.close();
    }
  });
});
