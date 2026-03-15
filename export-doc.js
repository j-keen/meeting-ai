// export-doc.js - PDF and Word export using CDN libraries


const CDN = {
  jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  html2canvas: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
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

/** Convert markdown to simple HTML for PDF rendering */
function markdownToHTML(markdown) {
  const lines = markdown.split('\n');
  const result = [];
  let inList = false;
  let listType = '';

  const closeList = () => {
    if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
  };

  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const formatInline = (text) => {
    let s = escapeHtml(text);
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    s = s.replace(/\*(.+?)\*/g, '<i>$1</i>');
    return s;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') { closeList(); result.push('<div style="height:10px"></div>'); continue; }

    if (/^---+$/.test(trimmed)) { closeList(); result.push('<hr style="border:none;border-top:1px solid #ccc;margin:8px 0">'); continue; }

    const hm = trimmed.match(/^(#{1,4}) (.+)$/);
    if (hm) {
      closeList();
      const level = hm[1].length;
      const sizes = { 1: '24px', 2: '20px', 3: '17px', 4: '15px' };
      const margins = { 1: '24px 0 12px', 2: '20px 0 10px', 3: '14px 0 6px', 4: '10px 0 4px' };
      const border = level <= 2 ? 'border-bottom:1px solid #ddd;padding-bottom:4px;' : '';
      result.push(`<div style="font-size:${sizes[level]};font-weight:700;color:#4f6ef7;margin:${margins[level]};${border}">${formatInline(hm[2])}</div>`);
      continue;
    }

    if (/^- \[[ x]\] /.test(trimmed)) {
      closeList();
      const checked = trimmed[3] === 'x';
      result.push(`<div style="margin:2px 0 2px 16px">${checked ? '☑' : '☐'} ${formatInline(trimmed.slice(6))}</div>`);
      continue;
    }

    if (/^[-*] /.test(trimmed)) {
      if (!inList || listType !== 'ul') { closeList(); result.push('<ul style="margin:4px 0 8px 8px;padding-left:16px">'); inList = true; listType = 'ul'; }
      result.push(`<li style="margin:4px 0">${formatInline(trimmed.slice(2))}</li>`);
      continue;
    }

    if (/^\d+\. /.test(trimmed)) {
      if (!inList || listType !== 'ol') { closeList(); result.push('<ol style="margin:4px 0 8px 8px;padding-left:16px">'); inList = true; listType = 'ol'; }
      result.push(`<li style="margin:4px 0">${formatInline(trimmed.replace(/^\d+\.\s*/, ''))}</li>`);
      continue;
    }

    closeList();
    result.push(`<div style="margin:2px 0">${formatInline(trimmed)}</div>`);
  }
  closeList();
  return result.join('\n');
}

export async function exportPDF(markdown, filename) {
  await Promise.all([
    loadScript(CDN.jspdf, 'jspdf'),
    loadScript(CDN.html2canvas, 'html2canvas'),
  ]);

  const { jsPDF } = window.jspdf;

  // Extract document title from first heading for page header
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const docTitle = titleMatch ? titleMatch[1].replace(/\*\*/g, '') : '';

  // Create off-screen container styled for A4-like rendering
  const container = document.createElement('div');
  container.style.cssText = [
    'position:absolute', 'left:-9999px', 'top:0',
    'width:660px', 'padding:20px 0', 'background:#fff', 'color:#222',
    'font-family:"Malgun Gothic","Noto Sans KR","Apple SD Gothic Neo","Segoe UI",sans-serif',
    'font-size:14px', 'line-height:1.8',
  ].join(';');
  container.innerHTML = markdownToHTML(markdown);
  document.body.appendChild(container);

  try {
    // Collect element boundaries for smart page breaking (before canvas render)
    // Flatten: include list items (li) as individual break points, not just top-level elements
    const canvasScale = 2;
    const elements = [];
    for (const el of container.children) {
      const tag = el.tagName;
      if ((tag === 'UL' || tag === 'OL') && el.children.length > 0) {
        // Add each list item as a separate break point
        for (const li of el.children) {
          elements.push({
            top: li.offsetTop,
            bottom: li.offsetTop + li.offsetHeight,
            isSectionHeading: false,
          });
        }
      } else {
        elements.push({
          top: el.offsetTop,
          bottom: el.offsetTop + el.offsetHeight,
          isSectionHeading: el.style.fontSize === '20px',
        });
      }
    }

    // Pre-render header text via canvas for Korean font support
    let headerCanvas = null;
    if (docTitle) {
      const headerEl = document.createElement('div');
      headerEl.style.cssText = [
        'position:absolute', 'left:-9999px', 'top:0',
        'width:660px', 'padding:2px 0', 'background:#fff',
        'font-family:"Malgun Gothic","Noto Sans KR","Apple SD Gothic Neo","Segoe UI",sans-serif',
        'font-size:11px', 'color:#828282',
      ].join(';');
      headerEl.textContent = docTitle;
      document.body.appendChild(headerEl);
      headerCanvas = await window.html2canvas(headerEl, {
        scale: canvasScale,
        backgroundColor: '#ffffff',
      });
      headerEl.remove();
    }

    const canvas = await window.html2canvas(container, {
      scale: canvasScale,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const headerH = docTitle ? 8 : 0;
    const footerH = 8;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2 - headerH - footerH;

    // mm per canvas pixel
    const imgScale = usableW / canvas.width;
    // max CSS pixels of content per page
    const maxCssPxPerPage = usableH / imgScale / canvasScale;

    // Build pages by grouping elements at natural boundaries
    const pages = []; // { start, end } in canvas pixels
    let pageStartCss = 0;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const usedCss = el.top - pageStartCss;

      // Conditional section break: only break before ## if page is ≥75% full
      if (el.isSectionHeading && usedCss > maxCssPxPerPage * 0.75) {
        pages.push({ start: pageStartCss * canvasScale, end: el.top * canvasScale });
        pageStartCss = el.top;
        continue;
      }

      // Orphan prevention: if a heading sits near page bottom with no room
      // for at least 2 elements after it, push heading to next page
      if (el.isSectionHeading) {
        const nextElBottom = elements[i + 1]?.bottom ?? el.bottom;
        if (nextElBottom - pageStartCss > maxCssPxPerPage && usedCss > 5) {
          pages.push({ start: pageStartCss * canvasScale, end: el.top * canvasScale });
          pageStartCss = el.top;
          continue;
        }
      }

      // Normal overflow: break at element boundary when content exceeds page
      if (el.bottom - pageStartCss > maxCssPxPerPage && usedCss > 5) {
        pages.push({ start: pageStartCss * canvasScale, end: el.top * canvasScale });
        pageStartCss = el.top;
      }
    }

    // Last page
    if (pageStartCss * canvasScale < canvas.height) {
      pages.push({ start: pageStartCss * canvasScale, end: canvas.height });
    }

    if (pages.length === 0) {
      pages.push({ start: 0, end: canvas.height });
    }

    const totalPages = pages.length;

    for (let i = 0; i < totalPages; i++) {
      if (i > 0) doc.addPage();

      const { start, end } = pages[i];
      const sliceH = end - start;
      if (sliceH <= 0) continue;

      // Extract page slice from full canvas
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceH;
      const ctx = sliceCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, start, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.92);
      const renderedH = sliceH * imgScale;
      const contentY = margin + headerH;
      doc.addImage(imgData, 'JPEG', margin, contentY, usableW, renderedH);

      // Header: document title on each page (rendered via canvas for Korean support)
      if (docTitle && headerCanvas) {
        const hImgData = headerCanvas.toDataURL('image/png');
        const hRenderedW = usableW;
        const hRenderedH = headerCanvas.height * (hRenderedW / headerCanvas.width);
        doc.addImage(hImgData, 'PNG', margin, margin, hRenderedW, hRenderedH);
        doc.setDrawColor(200);
        doc.setLineWidth(0.3);
        doc.line(margin, margin + headerH - 2, pageW - margin, margin + headerH - 2);
      }

      // Footer: page number
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text(`- ${i + 1} / ${totalPages} -`, pageW / 2, pageH - margin / 2, { align: 'center' });
    }

    doc.save(filename.endsWith('.pdf') ? filename : filename + '.pdf');
  } finally {
    container.remove();
  }
}

export async function exportWord(markdown, filename) {
  await loadScript(CDN.docx, 'docx');

  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;

  const children = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    // Headings
    if (line.startsWith('#### ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: parseDocxInline(line.slice(5), TextRun) }));
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: parseDocxInline(line.slice(4), TextRun) }));
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: parseDocxInline(line.slice(3), TextRun) }));
    } else if (line.startsWith('# ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: parseDocxInline(line.slice(2), TextRun) }));
    }
    // Bullet list
    else if (/^[-*] /.test(line)) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        children: parseDocxInline(line.slice(2), TextRun),
      }));
    }
    // Numbered list
    else if (/^\d+\. /.test(line)) {
      const text = line.replace(/^\d+\.\s*/, '');
      children.push(new Paragraph({
        numbering: { reference: 'default-numbering', level: 0 },
        children: parseDocxInline(text, TextRun),
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
      children.push(new Paragraph({ children: parseDocxInline(line, TextRun) }));
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

/** Parse inline markdown (bold, italic) into TextRun array for docx */
function parseDocxInline(text, TextRun) {
  const runs = [];
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
