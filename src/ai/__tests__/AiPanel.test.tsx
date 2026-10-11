import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addNode, aiProposalActions, canvasActions, connect, emptyCanvas, speakerNotesActions, updateNode, useAiProposalStore, useCanvasStore } from '../../data';
import { WalkthroughBar } from '../../canvas/BranchControls';
import { useWalkthroughStore, walkthroughActions } from '../../canvas/walkthrough';
import { aiActions } from '../aiActions';
import type { AiConfig } from '../../lib/ai/contracts';
import { PLAN_DEFINITIONS } from '../../lib/ai/plans';
import { aiConfigActions } from '../aiConfig';
import { AiPanel } from '../AiPanel';
import { AnswerText } from '../AnswerText';
import { aiApi } from '../api';

const PROJECT = '00000000-0000-4000-8000-0000000000aa';
const DOC = '00000000-0000-4000-8000-0000000000d1';

function config(plan: 'free' | 'pro'): AiConfig {
  return {
    enabled: true,
    plan,
    planLabel: plan === 'pro' ? 'Pro' : 'Free',
    features: [...PLAN_DEFINITIONS[plan].features],
    allowance: { used: 0, limit: 30, resetsAt: new Date(0).toISOString() },
    models: [],
    selectedModelId: null,
    activeModels: { fast: null, smart: null },
    keys: [],
    appProviders: ['google'],
    acceptRates: [],
    semanticSearch: true, researchSources: ['Wikipedia', 'OpenAlex'],
  };
}

const nav = { onIdea: vi.fn(), onPassage: vi.fn(), documentTitle: (id: string) => (id === DOC ? 'Draft' : null) };

function seedCanvas(): { a: string; b: string } {
  let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
  c = addNode(c, { position: { x: 400, y: 0 } });
  const [a, b] = c.nodes.map((n) => n.id) as [string, string];
  c = updateNode(updateNode(c, a, { title: 'Sleep helps memory' }), b, { title: 'Naps' });
  canvasActions.loadCanvas(c);
  return { a, b };
}

describe('AI panel', () => {
  beforeEach(() => {
    aiConfigActions.set(config('pro'));
    vi.spyOn(aiConfigActions, 'load').mockResolvedValue();
    nav.onIdea.mockClear();
    nav.onPassage.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders citations as chips that lead to the idea or passage', () => {
    const { a } = seedCanvas();
    render(<AnswerText text={`It helps [[idea:${a}]], see [[doc:${DOC}#p1]] and [[idea:gone]].`} nav={nav} />);
    fireEvent.click(screen.getByTestId('ai-source-idea'));
    expect(nav.onIdea).toHaveBeenCalledWith(a);
    fireEvent.click(screen.getByTestId('ai-source-doc'));
    expect(nav.onPassage).toHaveBeenCalledWith(DOC, 'p1');
    expect(screen.getByText('deleted idea')).toBeTruthy();
  });

  it('streams an answer and sends earlier turns with a follow-up', async () => {
    const { a } = seedCanvas();
    const ask = vi.spyOn(aiApi, 'ask').mockImplementation(async (_req, onText) => {
      onText('Partly');
      onText(`Yes [[idea:${a}]]`);
      return { text: `Yes [[idea:${a}]]`, model: 'Gemini', search: 'whole' };
    });
    render(<AiPanel projectId={PROJECT} open tab="ask" onTabChange={() => {}} onClose={() => {}} nav={nav} />);
    fireEvent.change(screen.getByTestId('ai-ask-input'), { target: { value: 'Does sleep help?' } });
    fireEvent.click(screen.getByTestId('ai-ask-submit'));
    await screen.findByText('Gemini · read the whole project');
    expect(screen.getByTestId('ai-source-idea').textContent).toContain('Sleep helps memory');

    fireEvent.change(screen.getByTestId('ai-ask-input'), { target: { value: 'Why?' } });
    fireEvent.keyDown(screen.getByTestId('ai-ask-input'), { key: 'Enter' });
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask.mock.calls[1]![0]).toEqual({
      projectId: PROJECT,
      question: 'Why?',
      history: [{ question: 'Does sleep help?', answer: `Yes [[idea:${a}]]` }],
    });
  });

  it('shows gap check issues, and the plan it needs on Free', async () => {
    const { a } = seedCanvas();
    vi.spyOn(aiApi, 'review').mockResolvedValue({
      issues: [{ kind: 'unsupported', message: 'No findings.', suggestion: 'Add some.', sources: [{ kind: 'idea', ideaId: a }], rule: true }],
      model: { id: 'm', label: 'Gemini' },
      allowance: config('pro').allowance,
      ownKey: false,
    });
    const { unmount } = render(<AiPanel projectId={PROJECT} open tab="review" onTabChange={() => {}} onClose={() => {}} nav={nav} />);
    fireEvent.click(screen.getByTestId('ai-review-run'));
    expect(await screen.findByText('No findings.')).toBeTruthy();
    expect(screen.getByText('Unsupported · rule')).toBeTruthy();
    unmount();

    act(() => aiConfigActions.set(config('free')));
    render(<AiPanel projectId={PROJECT} open tab="review" onTabChange={() => {}} onClose={() => {}} nav={nav} />);
    expect(screen.getAllByTestId('ai-upgrade-note').some((n) => n.textContent === 'Gap check is part of the Pro plan.')).toBe(true);
  });

  it('applies the chosen tidy suggestions in one step', async () => {
    const { a, b } = seedCanvas();
    vi.spyOn(aiApi, 'tidy').mockResolvedValue({
      suggestions: [
        { kind: 'retype', ideaId: a, type: 'conclusion', reason: 'It judges.' },
        { kind: 'connect', sourceId: a, targetId: b, reason: 'Related.' },
      ],
      model: { id: 'm', label: 'Gemini' },
      allowance: config('pro').allowance,
      ownKey: false,
    });
    const feedback = vi.spyOn(aiApi, 'feedback').mockImplementation(() => undefined);
    render(<AiPanel projectId={PROJECT} open tab="tidy" onTabChange={() => {}} onClose={() => {}} nav={nav} />);
    fireEvent.click(screen.getByTestId('ai-tidy-run'));
    expect(await screen.findByText('Make “Sleep helps memory” a conclusion')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    fireEvent.click(screen.getByTestId('ai-tidy-apply'));
    const canvas = useCanvasStore.getState().canvas;
    expect(canvas.nodes.find((n) => n.id === a)!.type).toBe('conclusion');
    expect(canvas.edges).toHaveLength(0);
    expect(feedback).toHaveBeenCalledWith({ feature: 'ai.tidy', offered: 2, accepted: 1 });
    expect(screen.getByRole('status').textContent).toContain('Applied 1 change');
  });

  it('writes speaker notes and shows them during the walkthrough', async () => {
    const { a, b } = seedCanvas();
    canvasActions.loadCanvas(connect(useCanvasStore.getState().canvas, { source: a, target: b, sourceSide: 'right', targetSide: 'left' }));
    const script = vi.spyOn(aiApi, 'script').mockResolvedValue({
      script: { opening: 'Welcome.', steps: [{ ideaId: a, note: 'Start here.' }, { ideaId: b, note: 'Then naps.' }], closing: 'Thanks.' },
      model: { id: 'm', label: 'Gemini' },
      allowance: config('pro').allowance,
      ownKey: false,
    });
    render(<AiPanel projectId={PROJECT} open tab="script" onTabChange={() => {}} onClose={() => {}} nav={nav} />);
    fireEvent.click(screen.getByTestId('ai-script-run'));
    expect(await screen.findByText('Then naps.')).toBeTruthy();
    expect(script.mock.calls[0]![0].steps).toEqual([a, b]);
    expect(screen.getAllByTestId('ai-script-step')).toHaveLength(2);

    render(<WalkthroughBar />);
    fireEvent.click(screen.getByTestId('ai-script-present'));
    expect(useWalkthroughStore.getState().active).toBe(true);
    expect((await screen.findByTestId('speaker-note')).textContent).toContain('Welcome.');
    act(() => {
      walkthroughActions.next();
    });
    expect(screen.getByTestId('speaker-note').textContent).toContain('Thanks.');
    act(() => {
      walkthroughActions.end();
      speakerNotesActions.clear();
    });
  });

  it('turns research into suggestions with where they came from', async () => {
    const { a } = seedCanvas();
    vi.spyOn(aiApi, 'research').mockResolvedValue({
      ideas: [{ key: 'r1', title: 'Naps help', body: 'Sources:\n- [Nap](https://en.wikipedia.org/wiki/Nap)', type: 'finding', parent: null }],
      queries: ['naps'],
      sourcesRead: 3,
      searched: ['Wikipedia', 'OpenAlex'],
      model: { id: 'm', label: 'Gemini' },
      allowance: config('pro').allowance,
      ownKey: false,
    });
    await aiActions.researchQuestion(a);
    const proposal = useAiProposalStore.getState().proposal!;
    expect(proposal).toMatchObject({ kind: 'research', anchorId: a, detail: 'read 3 sources from Wikipedia and OpenAlex' });
    expect(proposal.ideas[0]!.title).toBe('Naps help');
    act(() => aiProposalActions.clear());
  });
});
