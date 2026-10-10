import { beforeEach, describe, expect, it } from 'vitest';

import { docLinksActions, useDocLinksStore } from '../docLinks';

describe('document backlinks store', () => {
  beforeEach(() => docLinksActions.reset({ a: ['d1'], b: ['d1', 'd2'] }, { d1: 'One', d2: 'Two' }));

  it('replaces what one document cites', () => {
    docLinksActions.setDocumentLinks('d1', ['b', 'c']);
    expect(useDocLinksStore.getState().byIdea).toEqual({ b: ['d1', 'd2'], c: ['d1'] });
  });

  it('leaves the state alone when nothing changed', () => {
    const before = useDocLinksStore.getState().byIdea;
    docLinksActions.setDocumentLinks('d2', ['b']);
    expect(useDocLinksStore.getState().byIdea).toBe(before);
  });

  it('forgets a deleted document', () => {
    docLinksActions.removeDocument('d1');
    expect(useDocLinksStore.getState().byIdea).toEqual({ b: ['d2'] });
    expect(useDocLinksStore.getState().titles).toEqual({ d2: 'Two' });
  });
});
