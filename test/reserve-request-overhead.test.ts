/**
 * `reserveRequestOverhead`: compile and previewContext take the system prompt,
 * tool definitions and injections out of the budget before the strategy fits
 * messages into it, so `maxTokens` bounds the whole request. Off, as before,
 * the budget bounds the messages and the response reserve only.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContextManager, PassthroughStrategy } from '../src/index.js';
import type { ContextStrategy, TokenBudget } from '../src/types/index.js';
import type { ContentBlock } from '@animalabs/membrane';

const dir = mkdtempSync(join(tmpdir(), 'reserve-overhead-'));
after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
async function open(reserveRequestOverhead?: boolean) {
  const budgets: TokenBudget[] = [];
  const inner = new PassthroughStrategy();
  // The passthrough strategy, recording the budget each select is given.
  const strategy = new Proxy(inner, {
    get(target, key, receiver) {
      if (key === 'select') {
        return (...args: Parameters<ContextStrategy['select']>) => {
          budgets.push(args[2]);
          return target.select(...args);
        };
      }
      const value = Reflect.get(target, key, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const manager = await ContextManager.open({
    path: join(dir, `store-${n++}`),
    strategy,
    ...(reserveRequestOverhead !== undefined ? { reserveRequestOverhead } : {}),
  });
  for (let i = 0; i < 40; i++) {
    manager.addMessage(i % 2 ? 'Claude' : 'User', [{ type: 'text', text: `message ${i} ${'and more words '.repeat(20)}` }]);
  }
  return { manager, budgets };
}

const BUDGET: TokenBudget = { maxTokens: 2_000, reserveForResponse: 200 };
const SYSTEM = 'You are a kind companion. '.repeat(80);
const TOOLS = [{ name: 'remember', description: 'Store a note. '.repeat(30), inputSchema: { type: 'object', properties: { note: { type: 'string' } } } }];
const injection = (text: string) => ({ namespace: 'memory', position: 'beforeUser' as const, content: [{ type: 'text', text }] as ContentBlock[] });
// The store's estimate, as the manager prices the overhead (white-box).
const price = (manager: ContextManager, text: string): number =>
  (manager as unknown as { messageStore: { estimateTokens(m: unknown): number } }).messageStore
    .estimateTokens({ content: [{ type: 'text', text }] });

describe('reserveRequestOverhead', () => {
  it('off (the default), the strategy gets the budget as given, whatever the prompt, tools and injections', async () => {
    const { manager, budgets } = await open();
    try {
      manager.setSystemPrompt(SYSTEM);
      manager.setToolDefinitions(TOOLS as never);
      await manager.compile(BUDGET, [injection('a recalled fact '.repeat(40))]);
      assert.deepEqual(budgets.at(-1), BUDGET);
    } finally {
      manager.close();
    }
  });

  it('on, the strategy gets maxTokens less the system prompt, the tools and the injections, so fewer messages are sent', async () => {
    const off = await open(false);
    const on = await open(true);
    try {
      const fact = 'a recalled fact '.repeat(40);
      const inject = [injection(fact)];
      for (const { manager } of [off, on]) {
        manager.setSystemPrompt(SYSTEM);
        manager.setToolDefinitions(TOOLS as never);
      }
      const sentOff = (await off.manager.compile(BUDGET, inject)).messages.length;
      const sentOn = (await on.manager.compile(BUDGET, inject)).messages.length;

      const overhead = price(on.manager, SYSTEM) + price(on.manager, JSON.stringify(TOOLS)) + price(on.manager, fact);
      assert.ok(overhead > 0);
      assert.deepEqual(on.budgets.at(-1), { maxTokens: BUDGET.maxTokens - overhead, reserveForResponse: BUDGET.reserveForResponse });
      assert.ok(sentOn < sentOff, `fewer messages fit beside the overhead (${sentOn} < ${sentOff})`);
    } finally {
      off.manager.close();
      on.manager.close();
    }
  });

  it('on, with nothing set and no injections, changes nothing; an overhead past the budget leaves no room, never a negative one', async () => {
    const { manager, budgets } = await open(true);
    try {
      await manager.compile(BUDGET);
      assert.deepEqual(budgets.at(-1), BUDGET);
      manager.setSystemPrompt('x '.repeat(20_000));
      await manager.compile(BUDGET);
      assert.deepEqual(budgets.at(-1), { maxTokens: BUDGET.reserveForResponse, reserveForResponse: BUDGET.reserveForResponse });
    } finally {
      manager.close();
    }
  });
});
