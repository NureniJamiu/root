/**
 * A Root document as a Word file (.docx).
 *
 * Mirrors the Markdown export: headings, lists, quotes, code, tables and
 * images carry over, and every mention of an idea gets a real Word footnote
 * saying what the idea is and linking to its sources. Word numbers notes per
 * reference, so an idea mentioned twice gets two notes with the same text.
 * An embedded idea card becomes an indented quote of the idea.
 *
 * Loaded on demand (the `docx` library is large); images are fetched through
 * the `loadImage` callback so this file stays free of browser APIs.
 */

import type { JSONContent } from '@tiptap/core';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { IParagraphOptions, ParagraphChild } from 'docx';

import type { Node } from '../../data';
import { IDEA_CARD, IDEA_REF } from '../links';

import { FootnoteRegistry, footnoteText, ideaTarget } from './notes';

export interface LoadedImage {
  readonly data: ArrayBuffer;
  readonly type: 'png' | 'jpg' | 'gif' | 'bmp';
  /** Display size in pixels. */
  readonly width: number;
  readonly height: number;
}

export interface DocxExportInput {
  readonly title: string;
  readonly content: JSONContent;
  readonly ideas: ReadonlyMap<string, Node>;
  /** Fetch an image for embedding; null leaves its alt text in its place. */
  readonly loadImage?: (src: string) => Promise<LoadedImage | null>;
}

const ORDERED = 'root-ordered';
const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;
const CODE_FONT = 'Courier New';

type Block = Paragraph | Table;
type Indent = { readonly level: number; readonly quote: boolean };

class DocxWriter {
  readonly notes: FootnoteRegistry;
  /** Word footnote id → its paragraph. */
  readonly footnotes: Record<number, { children: Paragraph[] }> = {};
  private nextFootnote = 1;
  private listInstance = 0;
  private readonly images = new Map<string, Promise<LoadedImage | null>>();

  constructor(
    ideas: ReadonlyMap<string, Node>,
    private readonly loadImage: (src: string) => Promise<LoadedImage | null>,
  ) {
    this.notes = new FootnoteRegistry(ideas);
  }

  private footnote(ideaId: string, label: string): FootnoteReferenceRun {
    const note = this.notes.noteFor(ideaId, label);
    const id = this.nextFootnote++;
    this.footnotes[id] = { children: [new Paragraph({ children: [new TextRun(footnoteText(note))] })] };
    return new FootnoteReferenceRun(id);
  }

  private image(src: string): Promise<LoadedImage | null> {
    let pending = this.images.get(src);
    if (!pending) {
      pending = this.loadImage(src).catch(() => null);
      this.images.set(src, pending);
    }
    return pending;
  }

  async inline(nodes: readonly JSONContent[] | undefined): Promise<ParagraphChild[]> {
    const out: ParagraphChild[] = [];
    for (const node of nodes ?? []) {
      if (node.type === 'text') out.push(this.text(node));
      else if (node.type === 'hardBreak') out.push(new TextRun({ text: '', break: 1 }));
      else if (node.type === IDEA_REF) {
        const target = ideaTarget(node);
        if (!target) continue;
        out.push(new TextRun(this.notes.titleOf(target.id, target.label)), this.footnote(target.id, target.label));
      } else if (node.type === 'image') out.push(await this.imageRun(node));
    }
    return out;
  }

  private text(node: JSONContent): ParagraphChild {
    const has = (type: string) => node.marks?.some((m) => m.type === type) ?? false;
    const link = node.marks?.find((m) => m.type === 'link');
    const run = new TextRun({
      text: node.text ?? '',
      bold: has('bold'),
      italics: has('italic'),
      strike: has('strike'),
      ...(has('underline') ? { underline: {} } : {}),
      ...(has('highlight') ? { highlight: 'yellow' as const } : {}),
      ...(has('code') ? { font: CODE_FONT } : {}),
      ...(link ? { style: 'Hyperlink' } : {}),
    });
    return typeof link?.attrs?.href === 'string' ? new ExternalHyperlink({ link: link.attrs.href, children: [run] }) : run;
  }

  private async imageRun(node: JSONContent): Promise<ParagraphChild> {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const alt = String(node.attrs?.alt ?? '');
    const loaded = src ? await this.image(src) : null;
    if (!loaded) return new TextRun({ text: alt ? `[Image: ${alt}]` : '[Image]', italics: true });
    return new ImageRun({
      type: loaded.type,
      data: loaded.data,
      transformation: { width: loaded.width, height: loaded.height },
      altText: { name: alt || 'Image', description: alt, title: alt },
    });
  }

  private paragraph(children: ParagraphChild[], indent: Indent, extra: IParagraphOptions = {}): Paragraph {
    return new Paragraph({
      children,
      ...(indent.quote
        ? {
            indent: { left: 720 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BBBBBB', space: 12 } },
          }
        : {}),
      ...extra,
    });
  }

  async blocks(nodes: readonly JSONContent[] | undefined, indent: Indent = { level: 0, quote: false }): Promise<Block[]> {
    const out: Block[] = [];
    for (const node of nodes ?? []) out.push(...(await this.block(node, indent)));
    return out;
  }

  private async block(node: JSONContent, indent: Indent): Promise<Block[]> {
    switch (node.type) {
      case 'paragraph':
        return [this.paragraph(await this.inline(node.content), indent)];
      case 'heading': {
        const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
        return [this.paragraph(await this.inline(node.content), indent, { heading: HEADINGS[level - 1] ?? HeadingLevel.HEADING_1 })];
      }
      case 'blockquote':
        return this.blocks(node.content, { ...indent, quote: true });
      case 'codeBlock': {
        const lines = (node.content ?? []).map((t) => t.text ?? '').join('').split('\n');
        return [
          this.paragraph(
            lines.map((line, i) => new TextRun({ text: line, font: CODE_FONT, size: 20, ...(i > 0 ? { break: 1 } : {}) })),
            indent,
            { shading: { type: ShadingType.CLEAR, fill: 'F3F3F3', color: 'auto' } },
          ),
        ];
      }
      case 'horizontalRule':
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } } })];
      case 'image':
        return [this.paragraph([await this.imageRun(node)], indent, { alignment: AlignmentType.CENTER })];
      case 'bulletList':
      case 'taskList':
        return this.list(node, indent, null);
      case 'orderedList':
        return this.list(node, indent, this.listInstance++);
      case 'table':
        return [await this.table(node)];
      case IDEA_CARD:
        return this.ideaCard(node, indent);
      default:
        return node.content ? this.blocks(node.content, indent) : [];
    }
  }

  /** List items; `instance` is set for numbered lists, so each restarts at its own start. */
  private async list(node: JSONContent, indent: Indent, instance: number | null): Promise<Block[]> {
    const out: Block[] = [];
    const level = Math.min(indent.level, 8);
    for (const item of node.content ?? []) {
      const [first, ...rest] = item.content ?? [];
      const prefix =
        item.type === 'taskItem' ? [new TextRun(item.attrs?.checked ? '☑ ' : '☐ ')] : [];
      const runs = first?.type === 'paragraph' ? await this.inline(first.content) : [];
      out.push(
        this.paragraph([...prefix, ...runs], indent, {
          ...(instance === null ? { bullet: { level } } : { numbering: { reference: ORDERED, level, instance } }),
        }),
      );
      const remaining = first?.type === 'paragraph' ? rest : item.content ?? [];
      out.push(...(await this.blocks(remaining, { ...indent, level: indent.level + 1 })));
    }
    return out;
  }

  private async table(node: JSONContent): Promise<Table> {
    const rows = node.content ?? [];
    const width = Math.max(1, ...rows.map((r) => r.content?.length ?? 0));
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: await Promise.all(
        rows.map(async (row) =>
          new TableRow({
            children: await Promise.all(
              Array.from({ length: width }, async (_, i) => {
                const cell = row.content?.[i];
                const paragraphs = (await this.blocks(cell?.content)).filter((b): b is Paragraph => b instanceof Paragraph);
                return new TableCell({
                  children: paragraphs.length > 0 ? paragraphs : [new Paragraph('')],
                  ...(cell?.type === 'tableHeader' ? { shading: { type: ShadingType.CLEAR, fill: 'F3F3F3', color: 'auto' } } : {}),
                });
              }),
            ),
          }),
        ),
      ),
    });
  }

  private async ideaCard(node: JSONContent, indent: Indent): Promise<Block[]> {
    const target = ideaTarget(node);
    if (!target) return [];
    const quoted = { ...indent, quote: true };
    const head = this.paragraph(
      [new TextRun({ text: this.notes.titleOf(target.id, target.label), bold: true }), this.footnote(target.id, target.label)],
      quoted,
    );
    const body = this.notes.idea(target.id)?.body.trim() ?? '';
    const paragraphs = body
      .split(/\n\s*\n/)
      .filter((p) => p.trim())
      .map((p) => this.paragraph([new TextRun(p.replace(/\s*\n\s*/g, ' '))], quoted));
    return [head, ...paragraphs];
  }
}

/** The document as a .docx file. */
export async function documentToDocx({ title, content, ideas, loadImage = async () => null }: DocxExportInput): Promise<Blob> {
  const writer = new DocxWriter(ideas, loadImage);
  const body = await writer.blocks(content.content);
  const children: Block[] = title.trim() ? [new Paragraph({ text: title.trim(), heading: HeadingLevel.TITLE }), ...body] : body;
  const doc = new Document({
    title: title.trim() || 'Untitled document',
    creator: 'Root',
    numbering: {
      config: [
        {
          reference: ORDERED,
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    footnotes: writer.footnotes,
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}
