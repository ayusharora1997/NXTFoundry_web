import React, { useEffect, useState } from 'react';
import { Icon } from './ui';

// In-app document viewer. Uploaded PDFs open as they are; documents that exist only as data in this demo (seeded
// examples, ledger lines) get a generated copy, clearly marked as such.

/** A one-page A4 PDF from positioned lines of text and horizontal rules. ASCII only (standard PDF fonts). */
export function makePdf(lines: { text: string; x: number; y: number; size?: number; bold?: boolean }[], rules: number[] = []): Blob {
  const esc = (s: string) => s.replace(/₹/g, 'INR ').replace(/[–—]/g, '-').replace(/·/g, '-').replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
  const body = [...rules.map(y => `0.6 w 0.75 G 50 ${y} m 545 ${y} l S`), ...lines.map(l => `BT /${l.bold ? 'F2' : 'F1'} ${l.size ?? 10} Tf 1 0 0 1 ${l.x} ${l.y} Tm (${esc(l.text)}) Tj ET`)].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.4\n'; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return new Blob([out], { type: 'application/pdf' });
}

/** A document laid out like a printed credit note / debit note / refund advice. */
export interface DocSheet { title: string; number: string; date: string; from: [string, string]; to: [string, string]; rows: [string, string][]; against: string[]; note: string }
export function sheetPdf(d: DocSheet): Blob {
  const L: Parameters<typeof makePdf>[0] = []; let y = 790;
  L.push({ text: d.title.toUpperCase(), x: 50, y, size: 18, bold: true }); L.push({ text: `No. ${d.number}`, x: 380, y: y + 4, size: 11, bold: true }); L.push({ text: `Date ${d.date}`, x: 380, y: y - 12, size: 10 });
  y -= 48; L.push({ text: 'FROM', x: 50, y, size: 8, bold: true }); L.push({ text: 'TO', x: 300, y, size: 8, bold: true });
  y -= 14; L.push({ text: d.from[0], x: 50, y, size: 11, bold: true }); L.push({ text: d.to[0], x: 300, y, size: 11, bold: true });
  y -= 13; L.push({ text: d.from[1], x: 50, y, size: 9 }); L.push({ text: d.to[1], x: 300, y, size: 9 });
  y -= 26; const r1 = y + 12; L.push({ text: 'AGAINST', x: 50, y, size: 8, bold: true }); y -= 14;
  d.against.forEach(a => { L.push({ text: a, x: 50, y, size: 10 }); y -= 13; });
  y -= 10; const r2 = y + 12;
  d.rows.forEach(([k, v], i) => { const last = i === d.rows.length - 1; L.push({ text: k, x: 50, y, size: last ? 11 : 10, bold: last }); L.push({ text: v, x: 400, y, size: last ? 11 : 10, bold: last }); y -= last ? 0 : 16; });
  const r3 = y - 10; L.push({ text: d.note, x: 50, y: 60, size: 8 });
  return makePdf(L, [r1, r2, r3]);
}

export interface ViewDoc { name: string; url?: string; make?: () => Blob; generated?: boolean }
export function DocViewer({ doc, onClose }: { doc: ViewDoc; onClose: () => void }) {
  // Generated copies get their own object URL for as long as the viewer is open.
  const [url, setUrl] = useState(doc.url ?? '');
  useEffect(() => { if (doc.url) { setUrl(doc.url); return; } if (!doc.make) return; const u = URL.createObjectURL(doc.make()); setUrl(u); return () => URL.revokeObjectURL(u); }, [doc]);
  const inline = typeof navigator === 'undefined' || (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [onClose]);
  return <div className="rx-viewer" role="dialog" aria-modal="true" aria-label={`Viewing ${doc.name}`}>
    <div className="rx-viewer-scrim" onClick={onClose} />
    <div className="rx-viewer-box">
      <div className="rx-viewer-head"><span className="rx-att-ic small" aria-hidden="true">PDF</span><div><b>{doc.name}</b>{doc.generated && <small>Generated copy from the recorded details · demo</small>}</div>
        <a className="rw-btn small ghost" href={url} target="_blank" rel="noreferrer">Open in new tab</a>
        <a className="rw-btn small" href={url} download={doc.name}><Icon n="download" /> Download</a>
        <button className="rw-iconbtn" onClick={onClose} aria-label="Close viewer"><Icon n="x" /></button></div>
      {url && inline && <iframe className="rx-viewer-frame" src={url} title={doc.name} />}
      {url && !inline && <div className="rx-viewer-none"><span className="rx-att-ic" aria-hidden="true">PDF</span><b>This browser can’t show PDFs inside the page.</b><p>Open it in a new tab or download it to view.</p><div className="rd-btns"><a className="rw-btn" href={url} target="_blank" rel="noreferrer">Open in new tab</a><a className="rw-btn lime" href={url} download={doc.name}>Download</a></div></div>}
    </div>
  </div>;
}
