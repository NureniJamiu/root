/**
 * The browser's client for `/api/ai`. Every call either resolves with the
 * server's answer or throws an `AiRequestError` whose message is ready to
 * show to the person.
 */

import type {
  AiConfig,
  AiErrorBody,
  AiErrorCode,
  AiTestResult,
  DraftRequest,
  DraftResponse,
  ExpandRequest,
  MapRequest,
  RewriteRequest,
  SuggestionsResponse,
} from '../lib/ai/contracts';
import type { KeyedProvider } from '../lib/ai/models';
import { FEATURE_LABELS, cheapestPlanFor, PLAN_DEFINITIONS } from '../lib/ai/plans';

const API_BASE = '/api/ai';

/**
 * A backstop for a request the server never answers. The server gives up on
 * the model well before this, so it only fires when something in between hangs.
 */
const CLIENT_TIMEOUT_MS = 150_000;

/** A signal that aborts when `outer` does or after `ms`, whichever comes first. */
function withDeadline(outer: AbortSignal | undefined, ms: number): { signal: AbortSignal; timedOut: () => boolean; clear: () => void } {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, ms);
  const onAbort = () => controller.abort();
  if (outer?.aborted) controller.abort();
  else outer?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => expired,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

const TIMED_OUT_MESSAGE = 'The AI took too long to answer. Try again.';

export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly code: AiErrorCode | 'network' | 'aborted' | 'timeout',
    readonly status: number,
  ) {
    super(message);
    this.name = 'AiRequestError';
  }
}

async function errorFrom(res: Response): Promise<AiRequestError> {
  let body: Partial<AiErrorBody> = {};
  try {
    body = (await res.json()) as Partial<AiErrorBody>;
  } catch {
    /* not JSON */
  }
  if (res.status === 401) return new AiRequestError('Sign in again to use AI.', 'invalid', 401);
  if (body.code === 'upgrade' && body.feature) {
    const plan = cheapestPlanFor(body.feature);
    const planName = plan ? PLAN_DEFINITIONS[plan].label : 'a paid';
    return new AiRequestError(`${FEATURE_LABELS[body.feature]} is part of the ${planName} plan.`, 'upgrade', res.status);
  }
  return new AiRequestError(body.error ?? 'The AI request failed.', body.code ?? 'provider', res.status);
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

interface SendInit {
  readonly method: string;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

/** Send a request; the caller reads the body, then calls `clear`. */
async function send(path: string, init: SendInit): Promise<{ res: Response; deadline: ReturnType<typeof withDeadline> }> {
  const deadline = withDeadline(init.signal, CLIENT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: deadline.signal,
    });
  } catch (err) {
    deadline.clear();
    if (isAbort(err) || deadline.signal.aborted) {
      if (deadline.timedOut()) throw new AiRequestError(TIMED_OUT_MESSAGE, 'timeout', 0);
      throw new AiRequestError('Stopped.', 'aborted', 0);
    }
    throw new AiRequestError('Could not reach the server.', 'network', 0);
  }
  if (!res.ok) {
    try {
      throw await errorFrom(res);
    } finally {
      deadline.clear();
    }
  }
  return { res, deadline };
}

async function json<T>(path: string, init: SendInit): Promise<T> {
  const { res, deadline } = await send(path, init);
  try {
    return (await res.json()) as T;
  } catch (err) {
    if (deadline.timedOut()) throw new AiRequestError(TIMED_OUT_MESSAGE, 'timeout', 0);
    if (isAbort(err)) throw new AiRequestError('Stopped.', 'aborted', 0);
    throw new AiRequestError('The server sent an answer that could not be read.', 'network', 0);
  } finally {
    deadline.clear();
  }
}

export const aiApi = {
  config: () => json<AiConfig>('/config', { method: 'GET' }),
  setModel: (modelId: string | null) => json<AiConfig>('/settings', { method: 'PUT', body: { modelId } }),
  setKey: (provider: KeyedProvider, apiKey: string) =>
    json<AiConfig>(`/keys/${provider}`, { method: 'PUT', body: { apiKey } }),
  removeKey: (provider: KeyedProvider) => json<AiConfig>(`/keys/${provider}`, { method: 'DELETE' }),
  map: (req: MapRequest, signal?: AbortSignal) =>
    json<SuggestionsResponse>('/map', { method: 'POST', body: req, ...(signal ? { signal } : {}) }),
  expand: (req: ExpandRequest, signal?: AbortSignal) =>
    json<SuggestionsResponse>('/expand', { method: 'POST', body: req, ...(signal ? { signal } : {}) }),
  draft: (req: DraftRequest, signal?: AbortSignal) =>
    json<DraftResponse>('/draft', { method: 'POST', body: req, ...(signal ? { signal } : {}) }),
  /** Ask each configured model for a one-word reply, to check keys and models work. */
  test: () => json<{ results: AiTestResult[] }>('/test', { method: 'POST', body: {} }),

  /** Stream rewritten text; `onText` gets everything received so far. Resolves with the full text. */
  async rewrite(req: RewriteRequest, onText: (text: string) => void, signal?: AbortSignal): Promise<string> {
    const { res, deadline } = await send('/rewrite', { method: 'POST', body: req, ...(signal ? { signal } : {}) });
    let text = '';
    const decoder = new TextDecoder();
    try {
      if (!res.body) {
        text = await res.text();
        onText(text);
        return text;
      }
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        onText(text);
      }
    } catch (err) {
      if (deadline.timedOut()) throw new AiRequestError(TIMED_OUT_MESSAGE, 'timeout', 0);
      if (isAbort(err) || deadline.signal.aborted) throw new AiRequestError('Stopped.', 'aborted', 0);
      throw new AiRequestError('The answer was cut off. Try again.', 'network', 0);
    } finally {
      deadline.clear();
    }
    text += decoder.decode();
    onText(text);
    return text;
  },
};
