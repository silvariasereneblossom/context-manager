/**
 * Summaries are replayed in the agent's own voice, so the summarizer is told
 * where the summarized content came from (compressionAttribution, on unless
 * set to false): an L1 instruction names the other participants and the tools
 * the slice holds, and both L1 and merge instructions ask that their claims
 * stay theirs. The messages themselves are sent unchanged.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContextManager, AutobiographicalStrategy } from '../src/index.js';
import type { SummaryEntry } from '../src/types/index.js';
import type { ContentBlock } from '@animalabs/membrane';

const dir = mkdtempSync(join(tmpdir(), 'attribution-'));
after(() => rmSync(dir, { recursive: true, force: true }));

class Probe extends AutobiographicalStrategy {
  all(): SummaryEntry[] { return [...this.summaries]; }
}

type Request = { messages: Array<{ participant: string; content: ContentBlock[] }> };
const lastText = (request: Request): string => {
  const last = request.messages[request.messages.length - 1]!;
  return last.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
};
const PAGE = 'The page says that this supplement cures insomnia.';

async function run(name: string, attribution?: boolean) {
  const requests: Request[] = [];
  let n = 0;
  const membrane = {
    complete: async (request: Request) => {
      requests.push(request);
      return { stopReason: 'end_turn', content: [{ type: 'text', text: `a memory ${++n}` }], usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
  const strategy = new Probe({
    compressionModel: 'm', hierarchical: true, headWindowTokens: 1, recentWindowTokens: 0, l1HoldbackChunks: 0,
    targetChunkTokens: 80, autoTickOnNewMessage: false, minChunkCharsForLLM: 0, mergeThreshold: 2,
    ...(attribution !== undefined ? { compressionAttribution: attribution } : {}),
  } as never);
  const manager = await ContextManager.open({ path: join(dir, name), strategy, membrane: membrane as never });
  try {
    manager.setToolDefinitions([{ name: 'web_fetch', description: 'Fetch a page.', inputSchema: { type: 'object', properties: { url: { type: 'string' } } } }] as never);
    const say = (who: string, text: string) => manager.addMessage(who, [{ type: 'text', text }]);
    for (let round = 0; round < 4; round++) {
      say('User', `round ${round}: can you check whether this supplement helps with sleep? ${'please '.repeat(8)}`);
      manager.addMessage('Claude', [{ type: 'tool_use', id: `tu-${round}`, name: 'web_fetch', input: { url: 'https://example.test/supplement' } }]);
      manager.addMessage('User', [{ type: 'tool_result', toolUseId: `tu-${round}`, content: PAGE }]);
      say('Alex', `round ${round}: I read that it is completely safe for everyone. ${'really '.repeat(8)}`);
      say('Claude', `round ${round}: I looked it up and will keep that in mind. ${'okay '.repeat(8)}`);
    }
    for (let i = 0; i < 30; i++) await manager.tick();
    assert.ok(strategy.all().some((s) => s.level === 2), 'setup: a merge ran');
    return requests;
  } finally {
    manager.close();
  }
}

describe('compressionAttribution', () => {
  it('on (the default), an L1 instruction names the slice\'s other sources and asks to keep their claims theirs; a merge asks too', async () => {
    const requests = await run('default');
    const l1 = requests.find((r) => r.messages.some((m) => m.content.some((b) => b.type === 'tool_result')))!;
    assert.ok(l1, 'setup: an L1 request over the tool round');
    const instruction = lastText(l1);
    assert.match(instruction, /Where this slice's content came from, besides you: messages from User and Alex; calls to and results from the tool web_fetch\./);
    assert.match(instruction, /Attribution discipline: preserve who made each claim\./);
    // The tool result goes as it was stored, with no label inside it.
    const result = l1.messages.flatMap((m) => m.content).find((b) => b.type === 'tool_result') as { content: unknown };
    assert.equal(result.content, PAGE);

    const merges = requests.filter((r) => /You have just reviewed|consolidat/i.test(lastText(r)));
    assert.ok(merges.length > 0, 'setup: a merge request');
    for (const merge of merges) assert.match(lastText(merge), /Attribution discipline: preserve who made each claim\./);
  });

  it('set to false, no instruction carries the note or the rule', async () => {
    const requests = await run('off', false);
    assert.ok(requests.length > 0);
    for (const request of requests) {
      assert.doesNotMatch(lastText(request), /Attribution discipline|Where this slice's content came from/);
    }
  });
});
