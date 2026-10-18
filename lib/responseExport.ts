export type ResponseExportFormat = 'png' | 'pdf';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeColor(value: string) {
  const srgb = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)/i);
  if (srgb) {
    const channels = srgb.slice(1, 4).map((channel) => Math.round(Math.min(1, Number(channel)) * 255));
    const alpha = srgb[4] ? (srgb[4].endsWith('%') ? Number.parseFloat(srgb[4]) / 100 : Number(srgb[4])) : null;
    return alpha === null ? `rgb(${channels.join(' ')})` : `rgb(${channels.join(' ')} / ${Math.min(1, alpha)})`;
  }

  const oklch = value.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+%?|none)\s+([\d.]+(?:deg|rad|turn)?|none)(?:\s*\/\s*([\d.]+%?))?\s*\)/i);
  if (!oklch) return value;
  const lightness = oklch[1].endsWith('%') ? Number.parseFloat(oklch[1]) / 100 : Number(oklch[1]);
  const chroma = oklch[2] === 'none' ? 0 : oklch[2].endsWith('%') ? Number.parseFloat(oklch[2]) / 250 : Number(oklch[2]);
  const hue = oklch[3] === 'none' ? 0 : Number.parseFloat(oklch[3]) * (oklch[3].endsWith('turn') ? 360 : oklch[3].endsWith('rad') ? 180 / Math.PI : 1);
  const a = chroma * Math.cos(hue * Math.PI / 180);
  const b = chroma * Math.sin(hue * Math.PI / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const toSrgb = (channel: number) => {
    const linear = Math.max(0, Math.min(1, channel));
    return Math.round((linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055) * 255);
  };
  const channels = [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
  const alpha = oklch[4] ? (oklch[4].endsWith('%') ? Number.parseFloat(oklch[4]) / 100 : Number(oklch[4])) : null;
  return alpha === null ? `rgb(${channels.join(' ')})` : `rgb(${channels.join(' ')} / ${Math.min(1, alpha)})`;
}

export async function exportResponseElement(
  element: HTMLElement,
  format: ResponseExportFormat,
  filenameBase: string,
) {
  await document.fonts?.ready;

  const width = element.scrollWidth;
  const height = element.scrollHeight;
  if (!width || !height) throw new Error('The response has no visible content to export.');

  const scale = Math.min(
    1.5,
    16000 / width,
    16000 / height,
    Math.sqrt(30_000_000 / (width * height)),
  );
  const html2canvas = (await import('html2canvas')).default;
  const exportId = `response-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  element.dataset.exportId = exportId;
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale,
      useCORS: true,
      logging: false,
      width,
      height,
      onclone: (clonedDocument) => {
        const clonedRoot = clonedDocument.querySelector<HTMLElement>(`[data-export-id="${exportId}"]`);
        if (!clonedRoot) return;
        const rootStyle = window.getComputedStyle(element);
        clonedRoot.style.direction = rootStyle.direction;
        clonedRoot.style.fontFamily = rootStyle.fontFamily;
        clonedRoot.style.textAlign = rootStyle.textAlign;
        const sourceElements = [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))];
        const clonedElements = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll<HTMLElement>('*'))];
        sourceElements.forEach((source, index) => {
          const clone = clonedElements[index];
          if (!clone) return;
          const computed = window.getComputedStyle(source);
          clone.style.backgroundImage = 'none';
          clone.style.backgroundColor = index === 0 ? '#ffffff' : normalizeColor(computed.backgroundColor);
          clone.style.color = normalizeColor(computed.color);
          clone.style.borderColor = normalizeColor(computed.borderColor);
          clone.style.outline = 'none';
          clone.style.boxShadow = 'none';
          clone.style.textShadow = 'none';
          clone.style.textDecorationColor = normalizeColor(computed.textDecorationColor);
        });
      },
    });
  } finally {
    delete element.dataset.exportId;
  }

  if (format === 'png') {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('Could not create a PNG image from this response.'));
      }, 'image/png');
    });
    downloadBlob(blob, `${filenameBase}.png`);
    return;
  }

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const pageHeightPx = Math.floor(canvas.width * pageHeightMm / pageWidthMm);

  for (let top = 0; top < canvas.height; top += pageHeightPx) {
    if (top > 0) pdf.addPage();
    const cropHeight = Math.min(pageHeightPx, canvas.height - top);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = cropHeight;
    const context = pageCanvas.getContext('2d');
    if (!context) throw new Error('Could not prepare a PDF page for this response.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, top, canvas.width, cropHeight, 0, 0, canvas.width, cropHeight);
    pdf.addImage(
      pageCanvas.toDataURL('image/jpeg', 0.92),
      'JPEG',
      0,
      0,
      pageWidthMm,
      cropHeight * pageWidthMm / canvas.width,
      undefined,
      'FAST',
    );
  }

  pdf.save(`${filenameBase}.pdf`);
}

export function responseFilenameBase() {
  return `bayan_response_${new Date().toISOString().replace(/[:.]/g, '-')}`;
}
