/**
 * What the browser knows about AI for the signed-in person: their plan,
 * allowance, models and keys, as `/api/ai/config` reports it. Used only to
 * decide what to show; the server makes every real decision.
 */

import { create } from 'zustand';

import type { AiAllowance, AiConfig } from '../lib/ai/contracts';
import type { Feature } from '../lib/ai/plans';
import { aiApi } from './api';

export interface AiConfigState {
  config: AiConfig | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
}

export const useAiConfigStore = create<AiConfigState>(() => ({ config: null, status: 'idle' }));

let inflight: Promise<void> | null = null;

export const aiConfigActions = {
  /** Load the config once; later calls reuse it unless `force` is set. */
  load(force = false): Promise<void> {
    if (!force && useAiConfigStore.getState().status === 'ready') return Promise.resolve();
    if (!force && inflight) return inflight;
    // A refresh keeps showing what is known until the new answer arrives.
    if (!useAiConfigStore.getState().config) useAiConfigStore.setState({ status: 'loading' });
    const request = aiApi
      .config()
      .then((config) => useAiConfigStore.setState({ config, status: 'ready' }))
      .catch(() => {
        if (!useAiConfigStore.getState().config) useAiConfigStore.setState({ status: 'error' });
      })
      .finally(() => {
        if (inflight === request) inflight = null;
      });
    inflight = request;
    return request;
  },
  set(config: AiConfig): void {
    useAiConfigStore.setState({ config, status: 'ready' });
  },
  setAllowance(allowance: AiAllowance): void {
    const { config } = useAiConfigStore.getState();
    if (config) useAiConfigStore.setState({ config: { ...config, allowance } });
  },
};

/** AI can run at all for this person. */
export function useAiEnabled(): boolean {
  return useAiConfigStore((s) => s.config?.enabled ?? false);
}

/** Their plan includes `feature`. */
export function useAiFeature(feature: Feature): boolean {
  return useAiConfigStore((s) => s.config?.features.includes(feature) ?? false);
}
