// export-doc.js - PDF and Word export using CDN libraries


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
  container.innerHTML = markdownToHTML(markdown);
  Object.assign(container.style, {
    position: 'absolute', left: '-9999px', top: '0',
    width: '180mm', padding: '0',
    fontFamily: 'Pretendard, "Malgun Gothic", Arial, sans-serif',
    fontSize: '11pt', lineHeight: '1.6', color: '#222',
    background: '#fff',
  });

  document.body.appendChild(container);
  // Wait for layout to settle
  await new Promise(r => setTimeout(r, 100));

  try {
    await window.html2pdf().set({
      margin: [10, 15, 10, 15],
      filename: filename.endsWith('.pdf') ? filename : filename + '.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: container.scrollWidth },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(container).save();
  } finally {
    document.body.removeChild(container);
  }
}

/** Convert markdown to styled HTML for PDF export */
function markdownToHTML(md) {
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4 style="color:#4f6ef7;margin:0.8em 0 0.3em">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 style="color:#4f6ef7;margin:0.8em 0 0.3em">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="color:#4f6ef7;margin:1em 0 0.4em">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="color:#4f6ef7;margin:1em 0 0.4em;font-size:18pt">$1</h1>');
  // Bold / italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Checkbox lists
  html = html.replace(/^- \[ \] (.+)$/gm, '<li style="margin-left:1.5em;list-style:none">☐ $1</li>');
  html = html.replace(/^- \[x\] (.+)$/gm, '<li style="margin-left:1.5em;list-style:none">☑ $1</li>');
  // Bullet lists
  html = html.replace(/^[-*] (.+)$/gm, '<li style="margin-left:1.5em">$1</li>');
  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:1.5em">$1</li>');
  // HR
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #ddd;margin:1em 0">');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<br>\s*(<\/?(?:h[1-4]|li|hr|ul|ol))/g, '$1');
  html = html.replace(/(<\/(?:h[1-4]|li|hr|ul|ol)>)\s*<br>/g, '$1');
  return html;
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
