// export-doc.js - PDF and Word export using CDN libraries

import { renderMarkdown } from './chat.js';

const CDN = {
  html2pdf: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js',
  docx: 'https://cdn.jsdelivr.net/npm/docx@9.1.1/dist/index.iife.js',
};

function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(s);
  });
}

export async function exportPDF(markdown, filename) {
  await loadScript(CDN.html2pdf);

  const container = document.createElement('div');
  container.innerHTML = renderMarkdown(markdown);
  Object.assign(container.style, {
    position: 'fixed', left: '-9999px', top: '0',
    width: '210mm', padding: '15mm',
    fontFamily: 'Pretendard, "Malgun Gothic", sans-serif',
    fontSize: '11pt', lineHeight: '1.6', color: '#222',
  });
  // Style headers
  container.querySelectorAll('h1, h2, h3, h4').forEach(h => {
    h.style.color = '#4f6ef7';
    h.style.marginTop = '1em';
    h.style.marginBottom = '0.4em';
  });
  container.querySelectorAll('li').forEach(li => {
    li.style.marginLeft = '1.5em';
  });
  container.querySelectorAll('hr').forEach(hr => {
    hr.style.border = 'none';
    hr.style.borderTop = '1px solid #ddd';
    hr.style.margin = '1em 0';
  });

  document.body.appendChild(container);
  // Wait for DOM paint so html2canvas captures rendered content
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    await window.html2pdf().set({
      margin: [10, 15, 10, 15],
      filename: filename.endsWith('.pdf') ? filename : filename + '.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(container).save();
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportWord(markdown, filename) {
  await loadScript(CDN.docx);

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
