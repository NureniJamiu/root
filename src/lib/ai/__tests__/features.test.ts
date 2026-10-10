// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { describeBranch, describeExpandContext } from '../context';
import type { PromptCanvas } from '../contracts';
import { cleanSuggestions, draftDocument, streamRewrite, suggestExpansion, suggestMap } from '../features';
import { jsonModel, streamModel } from './mock';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

const canvas: PromptCanvas = {
  title: 'Sleep',
  nodes: [
    { id: A, title: 'Sleep and memory', body: 'Root question', type: 'topic' },
    { id: B, title: 'REM consolidates skills', body: 'From a review', type: 'finding' },
    { id: C, title: 'Does napping help?', body: '', type: 'question' },
  ],
  edges: [
    { source: A, target: B },
    { source: A, target: C },
  ],
};

const idea = (key: string, parent: string | null, title = `Idea ${key}`) => ({
  key,
  title,
  body: 'Why it matters.',
  type: 'finding' as const,
  parent,
});

describe('cleanSuggestions', () => {
  it('makes keys unique and parents point backwards', () => {
    const out = cleanSuggestions([idea('a', null), idea('a', 'a'), idea('c', 'zzz'), idea('d', 'd')], {
      max: 10,
      anchorAll: false,
    });
    expect(out.map((i) => i.key)).toEqual(['a', 'a_', 'c', 'd']);
    expect(out.map((i) => i.parent)).toEqual([null, 'a', 'a', 'a']);
  });

  it('drops empty titles, caps the count and anchors expansions', () => {
    const out = cleanSuggestions([idea('a', null, '  '), idea('b', 'x'), idea('c', 'b'), idea('d', null)], {
      max: 2,
      anchorAll: true,
    });
    expect(out).toHaveLength(2);
    expect(out.every((i) => i.parent === null)).toBe(true);
  });
});

describe('prompt context', () => {
  it('describes the idea, its path, children and siblings', () => {
    const text = describeExpandContext(canvas, B)!;
    expect(text).toContain('Idea to expand:\n[finding] REM consolidates skills');
    expect(text).toContain('It follows from');
    expect(text).toContain('Its siblings:\n- [question] Does napping help?');
    expect(describeExpandContext(canvas, '00000000-0000-4000-8000-000000000099')).toBeNull();
  });

  it('outlines a branch with ids', () => {
    const branch = describeBranch(canvas, A)!;
    expect(branch.ids).toEqual([A, B, C]);
    expect(branch.text).toContain(`  - id=${B} [finding] REM consolidates skills`);
  });
});

describe('features', () => {
  it('maps a topic into a tree', async () => {
    const model = jsonModel({ ideas: [idea('i1', null), idea('i2', 'i1'), idea('i3', 'i2')] });
    const result = await suggestMap(model, { topic: 'Sleep' });
    expect(result.output.map((i) => i.parent)).toEqual([null, 'i1', 'i2']);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    const prompt = JSON.stringify(model.doGenerateCalls[0]!.prompt);
    expect(prompt).toContain('Topic: Sleep');
  });

  it('expands an idea with the canvas as context', async () => {
    const model = jsonModel({ ideas: [idea('i1', 'i9'), idea('i2', null)] });
    const result = await suggestExpansion(model, { focusId: B, canvas });
    expect(result.output.every((i) => i.parent === null)).toBe(true);
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain('REM consolidates skills');
    await expect(suggestExpansion(model, { focusId: '00000000-0000-4000-8000-000000000099', canvas })).rejects.toThrow(
      'not on the canvas',
    );
  });

  it('keeps only draft sections for ideas in the branch', async () => {
    const model = jsonModel({
      title: 'Sleep and memory',
      intro: 'Intro.',
      sections: [
        { ideaId: B, text: 'REM matters [[' + B + ']].' },
        { ideaId: B, text: 'Duplicate.' },
        { ideaId: A, text: 'Root again.' },
        { ideaId: 'made-up', text: 'Invented.' },
        { ideaId: C, text: ' ' },
      ],
    });
    const result = await draftDocument(model, { rootId: A, canvas });
    expect(result.output.sections).toEqual([{ ideaId: B, text: `REM matters [[${B}]].` }]);
  });

  it('streams a rewrite and reports usage', async () => {
    let reported = null as unknown;
    const result = streamRewrite(streamModel(['Shorter ', 'text.']), { action: 'shorten', text: 'Long text here.' }, {
      onUsage: (u) => {
        reported = u;
      },
    });
    let text = '';
    for await (const chunk of result.textStream) text += chunk;
    expect(text).toBe('Shorter text.');
    await result.totalUsage;
    expect(reported).toEqual({ inputTokens: 40, outputTokens: 20 });
  });
});

describe('phase 2 features', () => {
  it('reviews a project, keeping only issues that point at something real', async () => {
    const { numberChunks, buildChunks } = await import('../project-content');
    const { reviewProject, ruleIssues } = await import('../features');
    const context = numberChunks(buildChunks({ title: 'Sleep', canvas, documents: [] }), 'Project: Sleep');
    const model = jsonModel({
      issues: [
        { kind: 'contradiction', refs: ['I2', 'I3'], message: 'These disagree.', suggestion: 'Check.' },
        { kind: 'unsupported', refs: ['I99'], message: 'Made up.', suggestion: '' },
        { kind: 'gap', refs: [], message: 'Nothing on age.', suggestion: 'Add a question.' },
      ],
    });
    const result = await reviewProject(model, context);
    expect(result.output.map((i) => i.kind)).toEqual(['contradiction', 'gap']);
    expect(result.output[0]!.sources).toEqual([
      { kind: 'idea', ideaId: B },
      { kind: 'idea', ideaId: C },
    ]);
    const withConclusion = { ...canvas, nodes: [...canvas.nodes, { id: '00000000-0000-4000-8000-00000000000d', title: 'So sleep matters', body: '', type: 'conclusion' as const }] };
    expect(ruleIssues(withConclusion)).toHaveLength(1);
  });

  it('turns text into connected ideas', async () => {
    const { captureIdeas } = await import('../features');
    const model = jsonModel({ ideas: [idea('a', null), idea('b', 'a'), idea('c', 'nope')] });
    const result = await captureIdeas(model, { text: 'Some passage.', canvas });
    expect(result.output.map((i) => i.parent)).toEqual([null, 'a', 'a']);
  });

  it('keeps only tidy suggestions that change something', async () => {
    const { suggestTidy } = await import('../features');
    const model = jsonModel({
      suggestions: [
        { kind: 'retype', ref: 'I3', type: 'question', title: null, to: null, reason: 'Already a question.' },
        { kind: 'retype', ref: 'I2', type: 'conclusion', title: null, to: null, reason: 'It judges.' },
        { kind: 'retitle', ref: 'I3', type: null, title: 'Do naps help memory?', to: null, reason: 'Clearer.' },
        { kind: 'connect', ref: 'I1', type: null, title: null, to: 'I2', reason: 'Already connected.' },
        { kind: 'connect', ref: 'I2', type: null, title: null, to: 'I3', reason: 'Related.' },
        { kind: 'connect', ref: 'I2', type: null, title: null, to: 'I40', reason: 'Unknown.' },
      ],
    });
    const result = await suggestTidy(model, { canvas });
    expect(result.output).toEqual([
      { kind: 'retype', ideaId: B, type: 'conclusion', reason: 'It judges.' },
      { kind: 'retitle', ideaId: C, title: 'Do naps help memory?', reason: 'Clearer.' },
      { kind: 'connect', sourceId: B, targetId: C, reason: 'Related.' },
    ]);
  });

  it('streams an answer from the numbered context', async () => {
    const { streamAnswer } = await import('../features');
    const result = streamAnswer(streamModel(['REM helps ', '[[I2]].']), { question: 'Why?', context: 'I2: REM' });
    let text = '';
    for await (const part of result.stream) if (part.type === 'text-delta') text += part.text;
    expect(text).toBe('REM helps [[I2]].');
  });
});
