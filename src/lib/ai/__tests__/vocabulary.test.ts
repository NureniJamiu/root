// @vitest-environment node
/**
 * The AI contract widening (M0 plan slice S7, D9): what each feature may
 * propose comes from the registry, prompts are generated from it and the
 * validity map, and the clean-up keeps only types and relations that fit.
 */
import { describe, expect, it } from 'vitest';

import { ENABLED_NODE_TYPE_IDS } from '../../../data/model/enabled';
import { NODE_TYPES } from '../../../data/model/nodeTypes';
import { isRelationAllowed } from '../../../data/model/relations';
import type { PromptCanvas } from '../contracts';
import { captureIdeas, cleanSuggestions, suggestExpansion, suggestMap, suggestTidy } from '../features';
import { relationsAmong, relationsGuide, typesFor, typesGuide } from '../vocabulary';
import { jsonModel, sequenceModel } from './mock';

const GENERAL = ['topic', 'finding', 'question', 'conclusion'];
const FRAMING = ['problem', 'objective', 'research-question', 'hypothesis', 'variable'];

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const idea = (key: string, type: string, parent: string | null, relation: string | null = null) => ({
  key,
  title: `Idea ${key}`,
  body: '',
  type,
  parent,
  relation,
});

/** The system prompt of the first call a sequence model saw. */
const systemOf = (model: { prompts: unknown[] }): string => {
  const messages = model.prompts[0] as Array<{ role: string; content: unknown }>;
  return String(messages.find((m) => m.role === 'system')?.content ?? '');
};

describe('vocabulary', () => {
  it('lets map, expand and tidy propose the general types and capture every M0 type', () => {
    expect(typesFor('ai.map')).toEqual(GENERAL);
    expect(typesFor('ai.expand')).toEqual(GENERAL);
    expect(typesFor('ai.tidy')).toEqual(GENERAL);
    expect(typesFor('ai.capture')).toEqual([...GENERAL, ...FRAMING]);
    expect(typesFor('ai.research')).toEqual(['finding', 'question']);
  });

  it('explains exactly the types it is given, from the registry', () => {
    const guide = typesGuide(typesFor('ai.capture'));
    for (const t of ENABLED_NODE_TYPE_IDS) expect(guide).toContain(`- ${t}: ${NODE_TYPES[t].aiGuide}`);
    expect(typesGuide(typesFor('ai.map'))).not.toContain('research-question');
  });

  it('lists only typed relations whose pairs fall within the given types', () => {
    expect(relationsAmong(typesFor('ai.map')).map((r) => r.id)).toEqual(['answers', 'supports', 'contradicts']);
    const capture = relationsAmong(typesFor('ai.capture')).map((r) => r.id);
    expect(capture).toEqual(['addresses', 'refines', 'involves', 'answers', 'supports', 'contradicts']);
    expect(relationsGuide(typesFor('ai.map'))).not.toContain('addresses');
    expect(relationsGuide(typesFor('ai.map'))).not.toContain('related-to:');
    expect(relationsAmong(typesFor('ai.map')).find((r) => r.id === 'answers')!.pairs).toEqual(['a finding answers a question']);
  });
});

describe('cleanSuggestions with types and relations', () => {
  it('drops types the feature may not propose', () => {
    const out = cleanSuggestions(
      [idea('a', 'topic', null), idea('b', 'objective', 'a'), idea('c', 'finding', 'b')] as never,
      { max: 10, anchorAll: false, types: typesFor('ai.map') },
    );
    expect(out.map((i) => [i.key, i.type, i.parent])).toEqual([
      ['a', 'topic', null],
      ['c', 'finding', 'a'],
    ]);
  });

  it('keeps a relation the map allows between parent and child, either way round', () => {
    const out = cleanSuggestions(
      [idea('q', 'question', null), idea('f', 'finding', 'q', 'answers'), idea('c', 'conclusion', 'f', 'supports')] as never,
      { max: 10, anchorAll: false, types: typesFor('ai.map') },
    );
    expect(out.map((i) => i.relation)).toEqual([null, 'answers', 'supports']);
    expect(isRelationAllowed('answers', 'question', 'finding')).toBe(true);
  });

  it('turns a relation that does not fit, or related-to, into a plain link', () => {
    const out = cleanSuggestions(
      [idea('t', 'topic', null), idea('f', 'finding', 't', 'supports'), idea('q', 'question', 't', 'related-to')] as never,
      { max: 10, anchorAll: false, types: typesFor('ai.map') },
    );
    expect(out.map((i) => i.relation)).toEqual([null, null, null]);
  });

  it('checks a relation against the parent the idea ends up with', () => {
    // "f" names a parent that does not exist, so it hangs from the first idea (a topic): supports no longer fits.
    const out = cleanSuggestions(
      [idea('t', 'topic', null), idea('f', 'finding', 'gone', 'supports')] as never,
      { max: 10, anchorAll: false, types: typesFor('ai.map') },
    );
    expect(out[1]).toMatchObject({ parent: 't', relation: null });
  });

  it('checks expansions against the idea being expanded', () => {
    const ideas = [idea('f', 'finding', null, 'answers')] as never;
    const fromQuestion = cleanSuggestions(ideas, { max: 5, anchorAll: true, types: typesFor('ai.expand'), anchorType: 'question' });
    const fromTopic = cleanSuggestions(ideas, { max: 5, anchorAll: true, types: typesFor('ai.expand'), anchorType: 'topic' });
    const noAnchor = cleanSuggestions(ideas, { max: 5, anchorAll: true, types: typesFor('ai.expand') });
    expect([fromQuestion[0]!.relation, fromTopic[0]!.relation, noAnchor[0]!.relation]).toEqual(['answers', null, null]);
  });
});

const framingCanvas: PromptCanvas = {
  title: 'Churn',
  nodes: [
    { id: id(1), title: 'Churn is rising', body: '', type: 'problem' },
    { id: id(2), title: 'Explain churn drivers', body: '', type: 'objective' },
    { id: id(3), title: 'What drives churn?', body: '', type: 'research-question' },
    { id: id(4), title: 'Price matters', body: '', type: 'finding' },
    { id: id(5), title: 'Raise prices', body: '', type: 'conclusion' },
  ],
  edges: [
    { source: id(3), target: id(2), relationType: 'related-to' },
    { source: id(4), target: id(5), relationType: 'supports' },
  ],
};

describe('features', () => {
  it('capture proposes problem-framing ideas with the relations between them', async () => {
    const model = sequenceModel([
      {
        ideas: [
          idea('o', 'objective', null),
          idea('rq', 'research-question', 'o', 'addresses'),
          idea('h', 'hypothesis', 'rq', 'addresses'),
          idea('v', 'variable', 'h', 'involves'),
        ],
      },
    ]);
    const { output } = await captureIdeas(model, { text: 'We aim to explain churn.', canvas: framingCanvas });
    expect(output.map((i) => [i.type, i.relation])).toEqual([
      ['objective', null],
      ['research-question', 'addresses'],
      ['hypothesis', 'addresses'],
      ['variable', 'involves'],
    ]);
    const system = systemOf(model);
    expect(system).toContain('- research-question: a formal question the study is designed to answer');
    expect(system).toContain('- involves:');
  });

  it('map and expand are told and constrained to the general types', async () => {
    const answer = { ideas: [idea('t', 'topic', null), idea('f', 'finding', 't')] };
    const map = sequenceModel([answer]);
    const mapped = await suggestMap(map, { topic: 'Churn' });
    expect(mapped.output.map((i) => i.type)).toEqual(['topic', 'finding']);
    expect(systemOf(map)).not.toContain('research-question');
    // The output schema itself rules problem-framing types out, so a provider enforcing it cannot return one.
    const stray = { ideas: [idea('t', 'topic', null), idea('o', 'objective', 't')] };
    await expect(suggestExpansion(jsonModel(stray), { focusId: id(4), canvas: framingCanvas })).rejects.toThrow();
    // An expansion from a question keeps "answers" for the findings it suggests.
    const fromQuestion = { ...framingCanvas, nodes: [...framingCanvas.nodes, { id: id(6), title: 'Why?', body: '', type: 'question' as const }] };
    const expanded = await suggestExpansion(jsonModel({ ideas: [idea('f', 'finding', null, 'answers')] }), {
      focusId: id(6),
      canvas: fromQuestion,
    });
    expect(expanded.output[0]).toMatchObject({ type: 'finding', parent: null, relation: 'answers' });
  });

  it('tidy sends connector meanings and suggests relations only for plain connectors', async () => {
    const model = sequenceModel([
      {
        suggestions: [
          // The research question's plain link to the objective: it addresses it.
          { kind: 'relate', ref: 'I3', type: null, title: null, to: 'I2', relation: 'addresses', reason: 'It asks what the objective sets out to explain.' },
          // Already typed: nothing to relate.
          { kind: 'relate', ref: 'I4', type: null, title: null, to: 'I5', relation: 'contradicts', reason: 'x' },
          // Not connected at all: relate needs a connector.
          { kind: 'relate', ref: 'I2', type: null, title: null, to: 'I1', relation: 'addresses', reason: 'x' },
          // A relation that does not fit the pair.
          { kind: 'relate', ref: 'I3', type: null, title: null, to: 'I2', relation: 'supports', reason: 'x' },
          // A new connector with a fitting relation, and one whose relation does not fit.
          { kind: 'connect', ref: 'I2', type: null, title: null, to: 'I1', relation: 'addresses', reason: 'It responds to the problem.' },
          { kind: 'connect', ref: 'I4', type: null, title: null, to: 'I3', relation: 'supports', reason: 'Related.' },
        ],
      },
    ]);
    const { output } = await suggestTidy(model, { canvas: framingCanvas });
    expect(output).toEqual([
      { kind: 'relate', sourceId: id(3), targetId: id(2), relation: 'addresses', reason: 'It asks what the objective sets out to explain.' },
      { kind: 'connect', sourceId: id(2), targetId: id(1), relation: 'addresses', reason: 'It responds to the problem.' },
      { kind: 'connect', sourceId: id(4), targetId: id(3), relation: null, reason: 'Related.' },
    ]);
    const messages = model.prompts[0] as Array<{ role: string; content: unknown }>;
    const user = JSON.stringify(messages.find((m) => m.role === 'user')?.content);
    expect(user).toContain('I3 → I2 (related-to)');
    expect(user).toContain('I4 → I5 (supports)');
  });

  it('tidy never retypes a problem-framing card, nor to a problem-framing type', async () => {
    const { output } = await suggestTidy(
      jsonModel({
        suggestions: [
          { kind: 'retype', ref: 'I3', type: 'question', title: null, to: null, relation: null, reason: 'x' },
          { kind: 'retype', ref: 'I4', type: 'conclusion', title: null, to: null, relation: null, reason: 'It judges.' },
        ],
      }),
      { canvas: framingCanvas },
    );
    expect(output).toEqual([{ kind: 'retype', ideaId: id(4), type: 'conclusion', reason: 'It judges.' }]);
  });
});
