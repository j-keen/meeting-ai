// export-doc.js - PDF and Word export using CDN libraries


const CDN = {
  jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  docx: 'https://cdn.jsdelivr.net/npm/docx@9.1.1/dist/index.iife.js',
};

const _scriptPromises = {};
function loadScript(url, globalName) {
  if (_scriptPromises[url]) return _scriptPromises[url];
  _scriptPromises[url] = new Promise((resolve, reject) => {
    if (globalName && window[globalName]) return resolve();
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) existing.remove();
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => {
      if (globalName && !window[globalName]) {
        delete _scriptPromises[url];
        reject(new Error(`Script loaded but ${globalName} not found`));
      } else {
        resolve();
      }
    };
    s.onerror = () => { delete _scriptPromises[url]; reject(new Error(`Failed to load ${url}`)); };
    document.head.appendChild(s);
  });
  return _scriptPromises[url];
}

export async function exportPDF(markdown, filename) {
  await loadScript(CDN.jspdf, 'jspdf');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = { top: 15, bottom: 15, left: 15, right: 15 };
  const contentW = pageW - margin.left - margin.right;
  let y = margin.top;

  const COLORS = { heading: [79, 110, 247], text: [34, 34, 34], muted: [120, 120, 120], hr: [200, 200, 200] };
  const FONT_SIZES = { h1: 16, h2: 14, h3: 12, h4: 11, body: 10, small: 9 };

  function checkPage(needed) {
    if (y + needed > pageH - margin.bottom) {
      doc.addPage();
      y = margin.top;
    }
  }

  /** Strip markdown bold/italic markers for measuring, return segments for styled rendering */
  function parseInline(text) {
    const segments = [];
    const regex = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*/g;
    let last = 0, m;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) segments.push({ text: text.slice(last, m.index), bold: false, italic: false });
      if (m[1]) segments.push({ text: m[1], bold: true, italic: true });
      else if (m[2]) segments.push({ text: m[2], bold: true, italic: false });
      else if (m[3]) segments.push({ text: m[3], bold: false, italic: true });
      last = regex.lastIndex;
    }
    if (last < text.length) segments.push({ text: text.slice(last), bold: false, italic: false });
    if (segments.length === 0) segments.push({ text, bold: false, italic: false });
    return segments;
  }

  function getFontStyle(bold, italic) {
    if (bold && italic) return 'bolditalic';
    if (bold) return 'bold';
    if (italic) return 'italic';
    return 'normal';
  }

  function renderWrappedLine(segments, fontSize, color, indent) {
    const x0 = margin.left + (indent || 0);
    const maxW = contentW - (indent || 0);
    const lineH = fontSize * 0.45;

    // Build words with style info
    const words = [];
    for (const seg of segments) {
      const parts = seg.text.split(/( +)/);
      for (const p of parts) {
        if (p) words.push({ text: p, bold: seg.bold, italic: seg.italic });
      }
    }

    let lineWords = [];
    let lineWidth = 0;

    function flushLine() {
      checkPage(lineH);
      let cx = x0;
      for (const w of lineWords) {
        doc.setFont('helvetica', getFontStyle(w.bold, w.italic));
        doc.setFontSize(fontSize);
        doc.setTextColor(...color);
        doc.text(w.text, cx, y);
        cx += doc.getTextWidth(w.text);
      }
      y += lineH;
      lineWords = [];
      lineWidth = 0;
    }

    for (const w of words) {
      doc.setFont('helvetica', getFontStyle(w.bold, w.italic));
      doc.setFontSize(fontSize);
      const ww = doc.getTextWidth(w.text);
      if (lineWords.length > 0 && lineWidth + ww > maxW) {
        flushLine();
      }
      lineWords.push(w);
      lineWidth += ww;
    }
    if (lineWords.length > 0) flushLine();
  }

  // Parse and render each line
  const lines = markdown.split('\n');
  let numberedIdx = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line
    if (trimmed === '') {
      y += 2;
      numberedIdx = 0;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      checkPage(4);
      y += 2;
      doc.setDrawColor(...COLORS.hr);
      doc.setLineWidth(0.3);
      doc.line(margin.left, y, pageW - margin.right, y);
      y += 4;
      numberedIdx = 0;
      continue;
    }

    // Headers
    let headingMatch;
    if ((headingMatch = trimmed.match(/^(#{1,4}) (.+)$/))) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const size = FONT_SIZES[`h${level}`] || FONT_SIZES.h3;
      y += level === 1 ? 4 : 2;
      checkPage(size * 0.5);
      renderWrappedLine(parseInline(text), size, COLORS.heading, 0);
      y += 1;
      numberedIdx = 0;
      continue;
    }

    // Checkbox items
    if (/^- \[[ x]\] /.test(trimmed)) {
      const checked = trimmed[3] === 'x';
      const text = trimmed.slice(6);
      const prefix = checked ? '☑ ' : '☐ ';
      renderWrappedLine(parseInline(prefix + text), FONT_SIZES.body, COLORS.text, 6);
      continue;
    }

    // Bullet list
    if (/^[-*] /.test(trimmed)) {
      const text = trimmed.slice(2);
      checkPage(5);
      doc.setFontSize(FONT_SIZES.body);
      doc.setTextColor(...COLORS.text);
      doc.text('•', margin.left + 3, y);
      renderWrappedLine(parseInline(text), FONT_SIZES.body, COLORS.text, 8);
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(trimmed)) {
      numberedIdx++;
      const text = trimmed.replace(/^\d+\.\s*/, '');
      checkPage(5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(FONT_SIZES.body);
      doc.setTextColor(...COLORS.text);
      doc.text(`${numberedIdx}.`, margin.left + 2, y);
      renderWrappedLine(parseInline(text), FONT_SIZES.body, COLORS.text, 10);
      continue;
    }

    // Normal paragraph
    numberedIdx = 0;
    renderWrappedLine(parseInline(trimmed), FONT_SIZES.body, COLORS.text, 0);
  }

  doc.save(filename.endsWith('.pdf') ? filename : filename + '.pdf');
}

export async function exportWord(markdown, filename) {
  await loadScript(CDN.docx, 'docx');

  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;

  const children = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    // Headings
    if (line.startsWith('#### ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: parseInline(line.slice(5), TextRun) }));
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: parseInline(line.slice(4), TextRun) }));
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: parseInline(line.slice(3), TextRun) }));
    } else if (line.startsWith('# ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: parseInline(line.slice(2), TextRun) }));
    }
    // Bullet list
    else if (/^[-*] /.test(line)) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        children: parseInline(line.slice(2), TextRun),
      }));
    }
    // Numbered list
    else if (/^\d+\. /.test(line)) {
      const text = line.replace(/^\d+\.\s*/, '');
      children.push(new Paragraph({
        numbering: { reference: 'default-numbering', level: 0 },
        children: parseInline(text, TextRun),
      }));
    }
    // Horizontal rule
    else if (/^---+$/.test(line.trim())) {
      children.push(new Paragraph({ children: [] }));
    }
    // Empty line
    else if (line.trim() === '') {
      children.push(new Paragraph({ children: [] }));
    }
    // Normal paragraph
    else {
      children.push(new Paragraph({ children: parseInline(line, TextRun) }));
    }
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
      }],
    },
    styles: {
      default: {
        document: {
          run: { font: { ascii: 'Arial', eastAsia: 'Malgun Gothic' }, size: 22 },
        },
      },
    },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.docx') ? filename : filename + '.docx';
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse inline markdown (bold, italic) into TextRun array */
function parseInline(text, TextRun) {
  const runs = [];
  // Split by bold (**...**) patterns while preserving them
  const regex = /\*\*(.+?)\*\*/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      runs.push(new TextRun({ text: text.slice(lastIdx, match.index) }));
    }
    runs.push(new TextRun({ text: match[1], bold: true }));
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIdx) }));
  }
  if (runs.length === 0) {
    runs.push(new TextRun({ text }));
  }
  return runs;
}
