import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSaveQueue } from '../save-queue';
import type { SaveOutcome, SaveStatus } from '../save-queue';

type Send = (id: string, snapshot: string, o: { keepalive: boolean }) => Promise<SaveOutcome>;

function setup(send: Send) {
  const statuses: SaveStatus[] = [];
  const errors: string[] = [];
  const queue = createSaveQueue<string>({
    send,
    delayMs: 500,
    retryMs: 1000,
    maxRetryMs: 4000,
    onStatus: (s) => statuses.push(s),
    onError: (_id, message) => errors.push(message),
  });
  return { queue, statuses, errors };
}

describe('createSaveQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for a quiet period and sends only the latest snapshot', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: true });
    const { queue, statuses } = setup(send);

    queue.schedule('a', 'v1');
    await vi.advanceTimersByTimeAsync(300);
    queue.schedule('a', 'v2');
    await vi.advanceTimersByTimeAsync(300);
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('a', 'v2', { keepalive: false });
    expect(statuses).toEqual(['saving', 'saved']);
  });

  it('keeps projects separate: a snapshot is only ever sent for its own project', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: true });
    const { queue } = setup(send);

    queue.schedule('a', 'a-canvas');
    queue.schedule('b', 'b-canvas');
    await vi.advanceTimersByTimeAsync(600);

    expect(send.mock.calls.map(([id, snap]) => [id, snap])).toEqual([
      ['a', 'a-canvas'],
      ['b', 'b-canvas'],
    ]);
  });

  it('never has two requests in flight, so saves land in order', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];
    const send: Send = async (_id, snapshot) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 200));
      order.push(snapshot);
      inFlight -= 1;
      return { ok: true };
    };
    const { queue } = setup(send);

    queue.schedule('a', 'first');
    await vi.advanceTimersByTimeAsync(550); // first is now in flight
    queue.schedule('a', 'second');
    await vi.advanceTimersByTimeAsync(2000);

    expect(maxInFlight).toBe(1);
    expect(order).toEqual(['first', 'second']);
  });

  it('flush() sends what is pending immediately and resolves when idle', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: true });
    const { queue, statuses } = setup(send);

    queue.schedule('a', 'v1');
    await queue.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('reports a failed save, keeps the snapshot and retries with backoff', async () => {
    const send = vi
      .fn<Send>()
      .mockResolvedValueOnce({ ok: false, message: 'offline' })
      .mockResolvedValueOnce({ ok: false, message: 'offline' })
      .mockResolvedValue({ ok: true });
    const { queue, statuses, errors } = setup(send);

    queue.schedule('a', 'v1');
    await vi.advanceTimersByTimeAsync(500);
    expect(errors).toEqual(['offline']);
    expect(statuses.at(-1)).toBe('error');

    await vi.advanceTimersByTimeAsync(1000); // first retry (1s) fails again
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1500); // second retry waits 2s
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(600);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith('a', 'v1', { keepalive: false });
    expect(statuses.at(-1)).toBe('saved');
  });

  it('does not retry a request the server rejected outright', async () => {
    const send = vi
      .fn<Send>()
      .mockResolvedValue({ ok: false, message: 'Project not found', fatal: true });
    const { queue, statuses, errors } = setup(send);

    queue.schedule('a', 'v1');
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(errors).toEqual(['Project not found']);
    expect(statuses.at(-1)).toBe('error');
  });

  it('a newer edit replaces the snapshot held for retry', async () => {
    const send = vi
      .fn<Send>()
      .mockResolvedValueOnce({ ok: false, message: 'offline' })
      .mockResolvedValue({ ok: true });
    const { queue } = setup(send);

    queue.schedule('a', 'old');
    await vi.advanceTimersByTimeAsync(500);
    queue.schedule('a', 'new');
    await vi.advanceTimersByTimeAsync(600);

    expect(send).toHaveBeenLastCalledWith('a', 'new', { keepalive: false });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('flushOnUnload() fires pending snapshots with keepalive and clears them', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: true });
    const { queue } = setup(send);

    queue.schedule('a', 'v1');
    queue.schedule('b', 'v2');
    queue.flushOnUnload();

    expect(send).toHaveBeenCalledWith('a', 'v1', { keepalive: true });
    expect(send).toHaveBeenCalledWith('b', 'v2', { keepalive: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(2); // the debounce timer was cancelled
  });

  it('discard() drops the pending snapshot of a deleted project', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: true });
    const { queue } = setup(send);

    queue.schedule('gone', 'v1');
    queue.discard('gone');
    await vi.advanceTimersByTimeAsync(1000);

    expect(send).not.toHaveBeenCalled();
  });
});
