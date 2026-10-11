// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { PromptCanvas } from '../contracts';
import { AiInputError, describeImages, researchQuestion, writeScript } from '../features';
import { toPromptCanvas } from '../project-content';
import type { WebSource } from '../web-search';
import { sequenceModel } from './mock';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const IMG1 = '00000000-0000-4000-8000-0000000000e1';
const IMG2 = '00000000-0000-4000-8000-0000000000e2';

const canvas: PromptCanvas = {
  title: 'Sleep',
  nodes: [
    { id: A, title: 'Sleep and memory', body: '', type: 'topic' },
    { id: B, title: 'Do naps help memory?', body: '', type: 'question' },
    { id: C, title: 'REM consolidates skills', body: '', type: 'finding' },
  ],
  edges: [
    { source: A, target: B },
    { source: A, target: C },
  ],
};

const sources: WebSource[] = [
  { title: 'Nap', url: 'https://en.wikipedia.org/wiki/Nap', snippet: 'Naps of 20 minutes...', site: 'Wikipedia', published: null, kind: 'encyclopedia' },
  { title: 'Naps and [learning]', url: 'https://doi.org/10.1/a(b)', snippet: 'A trial...', site: 'Sleep', published: '2020', kind: 'paper' },
];

describe('researchQuestion', () => {
  it('plans searches, then writes findings that link their sources', async () => {
    const model = sequenceModel([
      { queries: ['nap memory consolidation', 'nap memory consolidation', '  daytime nap learning  '] },
      {
        findings: [
          { title: 'Short naps improve recall', summary: 'Two sources agree.', type: 'finding', sources: ['S1', '[S2]', 'S9'] },
          { title: 'Unsupported claim', summary: 'No source.', type: 'finding', sources: [] },
          { title: 'Does nap length matter?', summary: 'Sources differ.', type: 'question', sources: [] },
          { title: 'Q2', summary: '', type: 'question', sources: [] },
          { title: 'Q3', summary: '', type: 'question', sources: [] },
        ],
      },
    ]);
    const searched: string[][] = [];
    const result = await researchQuestion(model, { focusId: B, canvas }, async (queries) => {
      searched.push([...queries]);
      return sources;
    });
    expect(searched).toEqual([['nap memory consolidation', 'daytime nap learning']]);
    expect(result.output.queries).toEqual(['nap memory consolidation', 'daytime nap learning']);
    expect(result.output.sourcesRead).toBe(2);
    expect(result.output.ideas.map((i) => [i.title, i.type, i.parent])).toEqual([
      ['Short naps improve recall', 'finding', null],
      ['Does nap length matter?', 'question', null],
      ['Q2', 'question', null],
    ]);
    expect(result.output.ideas[0]!.body).toBe(
      'Two sources agree.\n\nSources:\n- [Nap](https://en.wikipedia.org/wiki/Nap) · Wikipedia\n- [Naps and learning](https://doi.org/10.1/a%28b%29) · Sleep, 2020',
    );
    // Both calls count.
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
    // The sources reach the model as material.
    expect(JSON.stringify(model.prompts[1])).toContain('S2 | Naps and [learning] | Sleep, 2020');
  });

  it('searches the question itself when the plan is empty', async () => {
    const model = sequenceModel([{ queries: [] }, { findings: [{ title: 'F', summary: 's', type: 'finding', sources: ['S1'] }] }]);
    let asked: readonly string[] = [];
    await researchQuestion(model, { focusId: B, canvas }, async (q) => {
      asked = q;
      return sources;
    });
    expect(asked).toEqual(['Do naps help memory?']);
  });

  it('says so when nothing is found or nothing usable comes back', async () => {
    const plan = { queries: ['naps'] };
    await expect(researchQuestion(sequenceModel([plan]), { focusId: B, canvas }, async () => [])).rejects.toThrow(AiInputError);
    const empty = sequenceModel([plan, { findings: [{ title: 'F', summary: '', type: 'finding', sources: ['S5'] }] }]);
    await expect(researchQuestion(empty, { focusId: B, canvas }, async () => sources)).rejects.toThrow('did not answer');
    await expect(
      researchQuestion(sequenceModel([plan]), { focusId: '00000000-0000-4000-8000-000000000099', canvas }, async () => sources),
    ).rejects.toThrow('not on the canvas');
  });
});

describe('writeScript', () => {
  it('maps notes back to ideas in presentation order', async () => {
    const model = sequenceModel([
      {
        opening: 'Today: sleep.',
        steps: [
          { ref: 'I2', note: 'Naps   are next.' },
          { ref: 'I1', note: 'We start broad.' },
          { ref: 'I9', note: 'Ghost.' },
          { ref: 'I1', note: 'Duplicate.' },
        ],
        closing: 'So, sleep.',
      },
    ]);
    const result = await writeScript(model, { canvas, steps: [A, B, C, A] });
    expect(result.output).toEqual({
      opening: 'Today: sleep.',
      steps: [
        { ideaId: A, note: 'We start broad.' },
        { ideaId: B, note: 'Naps are next.' },
        { ideaId: C, note: '' },
      ],
      closing: 'So, sleep.',
    });
    expect(JSON.stringify(model.prompts[0])).toContain('I2: [question] Do naps help memory? (follows I1)');
  });

  it('refuses ideas that are not on the canvas', async () => {
    await expect(writeScript(sequenceModel([{}]), { canvas, steps: ['00000000-0000-4000-8000-000000000099'] })).rejects.toThrow(
      AiInputError,
    );
  });
});

describe('describeImages', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';

  it('sends each image to the model and maps captions back by ref', async () => {
    const model = sequenceModel([
      {
        images: [
          { ref: 'P2', caption: 'A bar chart of nap length.', text: '10 min  20 min' },
          { ref: 'P1', caption: '  A sleeping cat. ', text: '' },
          { ref: 'P7', caption: 'Ghost', text: '' },
          { ref: 'P1', caption: 'Again', text: '' },
        ],
      },
    ]);
    const result = await describeImages(model, {
      ideaTitle: 'Naps',
      images: [
        { id: IMG1, dataUrl: png },
        { id: IMG2, dataUrl: png },
      ],
    });
    expect(result.output).toEqual([
      { imageId: IMG2, caption: 'A bar chart of nap length.', text: '10 min  20 min' },
      { imageId: IMG1, caption: 'A sleeping cat.', text: '' },
    ]);
    const prompt = JSON.stringify(model.prompts[0]);
    expect(prompt).toContain('image/png');
    expect(prompt).toContain('“Naps”');
  });
});

describe('image captions in prompts', () => {
  it('adds described images to the notes the AI reads', () => {
    const prompt = toPromptCanvas({
      title: 'Sleep',
      nodes: [
        {
          id: A,
          title: 'Chart',
          body: 'My notes.',
          type: 'finding',
          images: [{ caption: 'Nap length vs recall.', text: 'recall\n%' }, {}],
        },
      ],
      edges: [],
    });
    expect(prompt.nodes[0]!.body).toBe('My notes.\n\n[Image] Nap length vs recall. | text in it: recall %');
  });
});
