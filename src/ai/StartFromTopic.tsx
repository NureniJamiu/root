/**
 * Shown on an empty canvas when AI is set up: type a topic and get a
 * starting map of ideas to choose from.
 */

import { useState } from 'react';

import { SparkleIcon } from '../nodes';
import { Button } from '../ui/Button';

export interface StartFromTopicProps {
  readonly onMapTopic: (topic: string) => void;
}

export function StartFromTopic({ onMapTopic }: StartFromTopicProps): JSX.Element {
  const [topic, setTopic] = useState('');
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const clean = topic.trim();
          if (clean) onMapTopic(clean);
        }}
        className="pointer-events-auto w-[440px] max-w-full bg-panel border border-rule-2 rounded-[3px] p-5 flex flex-col gap-3"
        style={{ boxShadow: '0 8px 24px rgb(var(--shadow) / 0.10)' }}
        data-testid="ai-start-from-topic"
      >
        <div className="flex items-center gap-2 text-accent">
          <SparkleIcon className="w-4 h-4" />
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Start from a topic</span>
        </div>
        <p className="m-0 font-serif text-[14px] leading-[21px] text-ink-read">
          Name what you are researching and AI will suggest a first map of ideas. Keep the ones you want, or
          double-click the canvas to start by hand.
        </p>
        <div className="flex gap-1.5">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={500}
            placeholder="e.g. Why do some cities have better public transport?"
            className="flex-1 min-w-0 h-9 px-2.5 rounded-[2px] border border-rule bg-paper text-[13px] text-ink-strong focus:outline-none focus:border-accent"
            aria-label="Research topic"
            data-testid="ai-start-input"
          />
          <Button type="submit" variant="cobalt" size="md" disabled={!topic.trim()} data-testid="ai-start-submit">
            Map it
          </Button>
        </div>
      </form>
    </div>
  );
}
