/**
 * A small, valid PDF for tests: one page of Helvetica text, with a title,
 * author and creation date in its information dictionary.
 */

export interface TestPdfLine {
  readonly text: string;
  readonly y: number;
  readonly size?: number;
}

export function makePdf(lines: readonly TestPdfLine[], info: { title?: string; author?: string; created?: string } = {}): Buffer {
  const esc = (t: string) => t.replace(/([\\()])/g, '\\$1');
  const stream = lines.map((l) => `BT /F1 ${l.size ?? 11} Tf 72 ${l.y} Td (${esc(l.text)}) Tj ET`).join('\n');
  const infoDict = [
    info.title ? `/Title (${esc(info.title)})` : '',
    info.author ? `/Author (${esc(info.author)})` : '',
    info.created ? `/CreationDate (D:${info.created})` : '',
  ].join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    `<< ${infoDict} >>`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
