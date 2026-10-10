import { describe, expect, it } from 'vitest';

import { addChild, addImage, addNode, emptyCanvas, updateNode } from '../../data';
import { promptCanvasSchema } from '../../lib/ai/contracts';
import { toPromptCanvas } from '../promptCanvas';

describe('toPromptCanvas', () => {
  it('sends text and connectors only, within the request limits', () => {
    let canvas = addNode({ ...emptyCanvas(), title: 'Project' }, { position: { x: 0, y: 0 } });
    const root = canvas.nodes[0]!.id;
    canvas = updateNode(canvas, root, { title: 'Root', body: 'x'.repeat(5_000) });
    canvas = addImage(canvas, root, {
      id: '11111111-1111-4111-8111-111111111111',
      dataUrl: 'data:image/png;base64,AAAA',
      addedAt: new Date(0).toISOString(),
    });
    canvas = addChild(canvas, root, { position: { x: 400, y: 0 } });
    const prompt = toPromptCanvas(canvas);
    expect(promptCanvasSchema.safeParse(prompt).success).toBe(true);
    expect(prompt.nodes[0]!.body).toHaveLength(2_000);
    expect(JSON.stringify(prompt)).not.toContain('data:image');
    expect(prompt.edges).toEqual([{ source: root, target: canvas.nodes[1]!.id }]);
  });
});
