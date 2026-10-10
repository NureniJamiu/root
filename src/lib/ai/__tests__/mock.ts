import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';

export const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

/** A model that answers every generate call with `value` as JSON. */
export function jsonModel(value: unknown): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: JSON.stringify(value) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: usage(100, 50),
      warnings: [],
    }),
  });
}

/** A model that streams `chunks` as text. */
export function streamModel(chunks: string[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        ...chunks.map((delta) => ({ type: 'text-delta' as const, id: 't', delta })),
        { type: 'text-end', id: 't' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: usage(40, 20) },
      ]),
    }),
  });
}
