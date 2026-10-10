/**
 * `/api/ai/*`: the AI features over HTTP.
 *
 * Every feature call goes through the same gate, in this order:
 *   1. rate limit (429 `rate-limit`)
 *   2. a valid request (400 `invalid`)
 *   3. the plan allows the feature (403 `upgrade`)
 *   4. a model and key exist (503 `no-model`)
 *   5. monthly allowance left, unless the person's own key runs it (402 `quota`)
 * then the call, then one `ai_usage` row. Every call has a time limit, and a
 * draft that fails on the stronger model for a passing reason (busy, quota,
 * time limit) is retried once on the fast model. Provider errors reach the
 * browser with the provider's own explanation and are logged on the server.
 * The routes expect `requireUser` in front of them (`res.locals.userId`).
 */

import express from 'express';
import type { Request, Response } from 'express';
import { APICallError, NoObjectGeneratedError, RetryError } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';

import { keySourceFor, modelOptions, resolveModel } from './access';
import type { AccessInput } from './access';
import { monthWindow } from './ai-store';
import type { AiStore, RateLimiter } from './ai-store';
import {
  draftRequestSchema,
  expandRequestSchema,
  keyRequestSchema,
  mapRequestSchema,
  rewriteRequestSchema,
  settingsRequestSchema,
} from './contracts';
import type { AiAllowance, AiConfig, AiErrorBody, AiErrorCode, AiResultMeta, AiTestResult } from './contracts';
import { AiInputError, draftDocument, pingModel, streamRewrite, suggestExpansion, suggestMap } from './features';
import type { TokenUsage } from './features';
import { lastFour, openKey, sealKey } from './keys';
import { AI_PROVIDERS, KEYED_PROVIDERS, PROVIDER_LABELS, estimateCostMicros, findModel, modelCatalog } from './models';
import type { AiModel, AiProvider, KeyedProvider, ModelRole } from './models';
import { PLAN_DEFINITIONS } from './plans';
import type { AiFeature, Plan } from './plans';
import { languageModelFor } from './providers';
import type { AiEnv } from './providers';

export interface AiRouterOptions {
  readonly store: AiStore;
  readonly env: AiEnv;
  /** Seals and opens people's own API keys. */
  readonly cryptoKey: CryptoKey;
  /** Plan for people who have none stored. */
  readonly defaultPlan: Plan;
  readonly limiter: RateLimiter;
  /** Swappable for tests: builds the callable model. */
  readonly buildModel?: (model: AiModel, apiKey: string, env: AiEnv) => LanguageModel;
  readonly now?: () => Date;
  /** Time limits in milliseconds; shorter in tests. */
  readonly timeouts?: Partial<Record<'suggest' | 'draft' | 'rewrite' | 'test', number>>;
}

const DEFAULT_TIMEOUTS = { suggest: 60_000, draft: 120_000, rewrite: 60_000, test: 30_000 } as const;

class AiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: AiErrorCode,
    message: string,
    readonly feature?: AiErrorBody['feature'],
  ) {
    super(message);
  }
}

function send(res: Response, status: number, body: AiErrorBody): void {
  if (!res.headersSent) res.status(status).json(body);
  else res.end();
}

function isKeyedProvider(value: string): value is KeyedProvider {
  return (KEYED_PROVIDERS as readonly string[]).includes(value);
}

/** The provider's own explanation of an error, short and without any key in it. */
export function providerDetail(error: InstanceType<typeof APICallError>): string {
  let detail = '';
  try {
    const body = JSON.parse(error.responseBody ?? '') as { error?: { message?: string } | string; message?: string };
    detail = (typeof body.error === 'string' ? body.error : body.error?.message) ?? body.message ?? '';
  } catch {
    /* not JSON */
  }
  return (detail || error.message)
    .replace(/(AIza|AQ\.|sk-[a-z]+-)[\w.-]{8,}/g, '[key]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error instanceof TimeoutReached);
}

class TimeoutReached extends Error {
  constructor() {
    super('The model took too long to answer.');
    this.name = 'TimeoutError';
  }
}

/** The provider error behind `error`, if there is one. */
function apiCallErrorOf(error: unknown): InstanceType<typeof APICallError> | null {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(cause) ? cause : null;
}

/** Worth retrying on another model: missing, busy, out of quota, a server error or too slow. */
function isPassingFailure(error: unknown): boolean {
  if (isTimeout(error)) return true;
  const status = apiCallErrorOf(error)?.statusCode ?? 0;
  // 404: the model was retired or isn't offered to this key, so another may still work.
  return status === 404 || status === 429 || status >= 500;
}

/** Turn anything a call threw into the answer the browser gets. */
function toHttpError(error: unknown, model?: AiModel): AiHttpError {
  if (error instanceof AiHttpError) return error;
  if (error instanceof AiInputError) return new AiHttpError(400, 'invalid', error.message);
  if (NoObjectGeneratedError.isInstance(error)) {
    return new AiHttpError(502, 'bad-output', 'The model answered in a shape Root could not use. Try again.');
  }
  const name = model ? model.label : 'The model';
  const provider = model ? PROVIDER_LABELS[model.provider] : 'The model provider';
  if (isTimeout(error)) {
    return new AiHttpError(
      504,
      'provider',
      `${name} took too long to answer. Try again, or pick a faster model in AI settings.`,
    );
  }
  const apiError = apiCallErrorOf(error);
  if (apiError) {
    const status = apiError.statusCode ?? 0;
    const detail = providerDetail(apiError);
    if (status === 401 || status === 403 || /api key/i.test(detail)) {
      return new AiHttpError(502, 'provider', `${provider} refused the API key: ${detail}`);
    }
    if (status === 404) {
      return new AiHttpError(
        502,
        'provider',
        `${name} isn't available to this API key (${detail}). Pick another model in AI settings.`,
      );
    }
    if (status === 429) {
      return new AiHttpError(502, 'provider', `${provider} says the quota is used up or it's busy: ${detail}`);
    }
    if (status >= 500) {
      return new AiHttpError(502, 'provider', `${provider} is having trouble right now (${status}): ${detail}`);
    }
    return new AiHttpError(502, 'provider', `${provider} returned an error (${status}): ${detail}`);
  }
  return new AiHttpError(500, 'provider', 'The AI request failed.');
}

/** Write a failed call to the server log, with the provider's explanation. */
function logFailure(what: string, model: AiModel | undefined, error: unknown): void {
  if (error instanceof AiHttpError || error instanceof AiInputError) return;
  const apiError = apiCallErrorOf(error);
  const where = model ? ` on ${model.id}` : '';
  if (apiError) {
    console.error(`[ai] ${what}${where} failed (${apiError.statusCode ?? 'no status'}): ${providerDetail(apiError)}`);
  } else if (isTimeout(error)) {
    console.error(`[ai] ${what}${where} timed out`);
  } else {
    console.error(`[ai] ${what}${where} failed:`, error);
  }
}

/**
 * A signal that aborts the model call when the browser goes away or the time
 * limit passes. A time-limit abort surfaces as a `TimeoutError`.
 */
function callSignal(req: Request, res: Response, ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutReached()), ms);
  const onClose = (): void => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClose);
  req.on('aborted', onClose);
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      res.off('close', onClose);
      req.off('aborted', onClose);
    },
  };
}

/** Run `work` with a time limit; a limit reached becomes a `TimeoutError`. */
async function withTimeLimit<T>(
  req: Request,
  res: Response,
  ms: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const call = callSignal(req, res, ms);
  try {
    return await work(call.signal);
  } catch (error) {
    if (call.signal.aborted && call.signal.reason instanceof TimeoutReached) throw call.signal.reason;
    throw error;
  } finally {
    call.done();
  }
}

export function createAiRouter(opts: AiRouterOptions): express.Router {
  const router = express.Router();
  const json = express.json({ limit: '2mb' });
  const now = opts.now ?? (() => new Date());
  const buildModel = opts.buildModel ?? languageModelFor;
  const timeouts = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };
  const catalog = modelCatalog(opts.env);
  const appProviders = new Set(
    AI_PROVIDERS.filter((p) => opts.env.appKeys[p]),
  ) as ReadonlySet<AiProvider>;

  async function planOf(userId: string): Promise<Plan> {
    return (await opts.store.getPlan(userId)) ?? opts.defaultPlan;
  }

  async function accessFor(userId: string, plan: Plan): Promise<AccessInput> {
    const keys = await opts.store.listKeys(userId);
    return { catalog, plan, appProviders, ownProviders: new Set(keys.map((k) => k.provider)) };
  }

  async function allowanceOf(userId: string, plan: Plan): Promise<AiAllowance> {
    const window = monthWindow(now());
    return {
      used: await opts.store.countActions(userId, window.start),
      limit: PLAN_DEFINITIONS[plan].monthlyActions,
      resetsAt: window.resetsAt,
    };
  }

  async function buildConfig(userId: string): Promise<AiConfig> {
    const plan = await planOf(userId);
    const access = await accessFor(userId, plan);
    const selectedModelId = await opts.store.getModelId(userId);
    const defaults = {
      userModelId: selectedModelId,
      fastModelId: opts.env.defaultModelId ?? null,
      smartModelId: opts.env.smartModelId ?? null,
    };
    const fast = resolveModel(access, defaults, 'fast');
    const smart = resolveModel(access, defaults, 'smart');
    return {
      enabled: fast !== null,
      plan,
      planLabel: PLAN_DEFINITIONS[plan].label,
      features: [...PLAN_DEFINITIONS[plan].features],
      allowance: await allowanceOf(userId, plan),
      models: modelOptions(access),
      selectedModelId,
      activeModels: { fast: fast?.id ?? null, smart: smart?.id ?? null },
      keys: await opts.store.listKeys(userId),
      appProviders: [...appProviders],
    };
  }

  interface Prepared {
    readonly userId: string;
    readonly plan: Plan;
    readonly model: AiModel;
    readonly languageModel: LanguageModel;
    readonly ownKey: boolean;
  }

  /** The model, key and callable model for `role`, without plan or quota checks. */
  async function resolveCall(userId: string, plan: Plan, role: ModelRole): Promise<Prepared> {
    const access = await accessFor(userId, plan);
    const model = resolveModel(
      access,
      {
        userModelId: await opts.store.getModelId(userId),
        fastModelId: opts.env.defaultModelId ?? null,
        smartModelId: opts.env.smartModelId ?? null,
      },
      role,
    );
    const source = model ? keySourceFor(model, access) : null;
    if (!model || !source) {
      throw new AiHttpError(503, 'no-model', 'No AI model is set up yet. Add an API key in AI settings.');
    }
    let apiKey: string;
    if (source === 'own' && isKeyedProvider(model.provider)) {
      const sealed = await opts.store.getKey(userId, model.provider);
      if (!sealed) throw new AiHttpError(503, 'no-model', 'Your API key is missing. Add it again in AI settings.');
      try {
        apiKey = await openKey(opts.cryptoKey, userId, sealed);
      } catch {
        throw new AiHttpError(503, 'no-model', 'Your saved API key could not be read. Add it again in AI settings.');
      }
    } else {
      apiKey = opts.env.appKeys[model.provider] ?? '';
    }
    return { userId, plan, model, languageModel: buildModel(model, apiKey, opts.env), ownKey: source === 'own' };
  }

  /** Steps 1 and 3 to 5 of the gate; the caller has validated the body. */
  async function prepare(res: Response, feature: AiFeature, role: ModelRole): Promise<Prepared> {
    const userId = res.locals.userId as string;
    const plan = await planOf(userId);
    if (!PLAN_DEFINITIONS[plan].features.includes(feature)) {
      throw new AiHttpError(403, 'upgrade', 'Your plan does not include this AI feature.', feature);
    }
    const p = await resolveCall(userId, plan, role);
    if (!p.ownKey) {
      const allowance = await allowanceOf(userId, plan);
      if (allowance.used >= allowance.limit) {
        throw new AiHttpError(402, 'quota', "You've used this month's AI actions.", feature);
      }
    }
    return p;
  }

  /**
   * Gate, then run `work` on the model for `role` within the time limit. A
   * draft that fails for a passing reason is tried once more on the fast model.
   * Records usage for whichever model answered.
   */
  async function runFeature<T extends { usage: TokenUsage }>(
    req: Request,
    res: Response,
    feature: AiFeature,
    role: ModelRole,
    ms: number,
    work: (model: LanguageModel, signal: AbortSignal) => Promise<T>,
  ): Promise<{ p: Prepared; result: T }> {
    const first = await prepare(res, feature, role);
    try {
      const result = await withTimeLimit(req, res, ms, (signal) => work(first.languageModel, signal));
      await record(first, feature, result.usage);
      return { p: first, result };
    } catch (error) {
      logFailure(feature, first.model, error);
      if (role !== 'smart' || !isPassingFailure(error) || res.writableEnded) throw toHttpError(error, first.model);
      const second = await resolveCall(first.userId, first.plan, 'fast').catch(() => null);
      if (!second || second.model.id === first.model.id) throw toHttpError(error, first.model);
      console.error(`[ai] ${feature}: retrying on ${second.model.id}`);
      try {
        const result = await withTimeLimit(req, res, ms, (signal) => work(second.languageModel, signal));
        await record(second, feature, result.usage);
        return { p: second, result };
      } catch (retryError) {
        logFailure(feature, second.model, retryError);
        throw toHttpError(retryError, second.model);
      }
    }
  }

  async function record(p: Prepared, feature: AiFeature, usage: TokenUsage): Promise<void> {
    await opts.store.recordUsage({
      userId: p.userId,
      feature,
      provider: p.model.provider,
      model: p.model.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costMicros: estimateCostMicros(p.model, usage),
      ownKey: p.ownKey,
    });
  }

  async function meta(p: Prepared): Promise<AiResultMeta> {
    return {
      model: { id: p.model.id, label: p.model.label },
      allowance: await allowanceOf(p.userId, p.plan),
      ownKey: p.ownKey,
    };
  }

  function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AiHttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    return parsed.data;
  }

  function limit(res: Response): void {
    if (!opts.limiter.take(res.locals.userId as string)) {
      throw new AiHttpError(429, 'rate-limit', 'Too many AI requests. Wait a moment and try again.');
    }
  }

  function fail(res: Response, error: unknown, model?: AiModel): void {
    const e = toHttpError(error, model);
    send(res, e.status, { error: e.message, code: e.code, ...(e.feature ? { feature: e.feature } : {}) });
  }

  /* ------------------------------------------------------------------------ */
  /* Settings                                                                 */
  /* ------------------------------------------------------------------------ */

  router.get('/config', async (_req, res) => {
    try {
      res.json(await buildConfig(res.locals.userId as string));
    } catch (error) {
      fail(res, error);
    }
  });

  router.put('/settings', json, async (req, res) => {
    try {
      const { modelId } = parse(settingsRequestSchema, req.body);
      if (modelId !== null && !findModel(catalog, modelId)) {
        throw new AiHttpError(400, 'invalid', 'Unknown model.');
      }
      await opts.store.setModelId(res.locals.userId as string, modelId);
      res.json(await buildConfig(res.locals.userId as string));
    } catch (error) {
      fail(res, error);
    }
  });

  router.put('/keys/:provider', json, async (req, res) => {
    try {
      const provider = String(req.params.provider);
      if (!isKeyedProvider(provider)) throw new AiHttpError(400, 'invalid', 'Unknown provider.');
      const { apiKey } = parse(keyRequestSchema, req.body);
      const userId = res.locals.userId as string;
      const sealed = await sealKey(opts.cryptoKey, userId, apiKey);
      await opts.store.putKey(userId, provider, sealed, lastFour(apiKey));
      res.json(await buildConfig(userId));
    } catch (error) {
      fail(res, error);
    }
  });

  router.delete('/keys/:provider', async (req, res) => {
    try {
      const provider = String(req.params.provider);
      if (!isKeyedProvider(provider)) throw new AiHttpError(400, 'invalid', 'Unknown provider.');
      await opts.store.deleteKey(res.locals.userId as string, provider);
      res.json(await buildConfig(res.locals.userId as string));
    } catch (error) {
      fail(res, error);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Features                                                                 */
  /* ------------------------------------------------------------------------ */

  router.post('/map', json, async (req, res) => {
    try {
      limit(res);
      const body = parse(mapRequestSchema, req.body);
      const { p, result } = await runFeature(req, res, 'ai.map', 'fast', timeouts.suggest, (model, signal) =>
        suggestMap(model, body, signal),
      );
      res.json({ ideas: result.output, ...(await meta(p)) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post('/expand', json, async (req, res) => {
    try {
      limit(res);
      const body = parse(expandRequestSchema, req.body);
      const { p, result } = await runFeature(req, res, 'ai.expand', 'fast', timeouts.suggest, (model, signal) =>
        suggestExpansion(model, body, signal),
      );
      res.json({ ideas: result.output, ...(await meta(p)) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post('/draft', json, async (req, res) => {
    try {
      limit(res);
      const body = parse(draftRequestSchema, req.body);
      const { p, result } = await runFeature(req, res, 'ai.draft', 'smart', timeouts.draft, (model, signal) =>
        draftDocument(model, body, signal),
      );
      res.json({ draft: result.output, ...(await meta(p)) });
    } catch (error) {
      fail(res, error);
    }
  });

  /**
   * Streams plain text. Headers wait for the first words, so a refused key or
   * an empty answer still gets a proper JSON error instead of an empty 200.
   */
  router.post('/rewrite', json, async (req, res) => {
    let prepared: Prepared | null = null;
    let call: ReturnType<typeof callSignal> | null = null;
    try {
      limit(res);
      const body = parse(rewriteRequestSchema, req.body);
      const p = await prepare(res, 'ai.rewrite', 'fast');
      prepared = p;
      call = callSignal(req, res, timeouts.rewrite);
      let usage: TokenUsage | null = null;
      const result = streamRewrite(p.languageModel, body, {
        signal: call.signal,
        onUsage: (u) => {
          usage = u;
        },
      });
      let started = false;
      for await (const part of result.stream) {
        if (part.type === 'text-delta' && part.text) {
          if (!started) {
            started = true;
            res.status(200);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-AI-Model', p.model.label);
          }
          res.write(part.text);
        } else if (part.type === 'error') {
          throw part.error;
        }
      }
      if (call.signal.aborted && call.signal.reason instanceof TimeoutReached) throw call.signal.reason;
      if (!started) throw new AiHttpError(502, 'bad-output', 'The model returned no text. Try again.');
      res.end();
      await record(p, 'ai.rewrite', usage ?? NO_USAGE);
    } catch (error) {
      const reason = call?.signal.aborted && call.signal.reason instanceof TimeoutReached ? call.signal.reason : error;
      logFailure('ai.rewrite', prepared?.model, reason);
      if (res.headersSent) {
        // Text already went out, so the action counts even though it stopped early.
        res.end();
        if (prepared) await record(prepared, 'ai.rewrite', NO_USAGE).catch(() => undefined);
      } else {
        fail(res, reason, prepared?.model);
      }
    } finally {
      call?.done();
    }
  });

  /**
   * Try the models this person's AI features run on with a one-word prompt,
   * and report what each provider says. Not counted against the allowance.
   */
  router.post('/test', async (req, res) => {
    try {
      limit(res);
      const userId = res.locals.userId as string;
      const plan = await planOf(userId);
      const results: AiTestResult[] = [];
      const seen = new Set<string>();
      for (const role of ['fast', 'smart'] as const) {
        let p: Prepared;
        try {
          p = await resolveCall(userId, plan, role);
        } catch (error) {
          results.push({ role, modelId: null, label: null, ok: false, message: toHttpError(error).message, ms: 0 });
          continue;
        }
        if (seen.has(p.model.id)) continue;
        seen.add(p.model.id);
        const started = Date.now();
        try {
          const reply = await withTimeLimit(req, res, timeouts.test, (signal) => pingModel(p.languageModel, signal));
          results.push({ role, modelId: p.model.id, label: p.model.label, ok: true, message: `Answered “${reply.slice(0, 40)}”`, ms: Date.now() - started });
        } catch (error) {
          logFailure('test', p.model, error);
          results.push({ role, modelId: p.model.id, label: p.model.label, ok: false, message: toHttpError(error, p.model).message, ms: Date.now() - started });
        }
      }
      res.json({ results });
    } catch (error) {
      fail(res, error);
    }
  });

  return router;
}

const NO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };
