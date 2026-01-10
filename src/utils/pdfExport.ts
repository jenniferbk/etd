import { jsPDF } from 'jspdf';
import Konva from 'konva';

interface PdfExportOptions {
  filename?: string;
  orientation?: 'portrait' | 'landscape';
  quality?: number;
}

export async function exportToPdf(options: PdfExportOptions = {}): Promise<void> {
  const {
    filename = `toulmin-diagram-${Date.now()}.pdf`,
    orientation = 'landscape',
    quality = 2,
  } = options;

  // Get the Konva stage
  const stages = Konva.stages;
  if (stages.length === 0) {
    throw new Error('No canvas found to export');
  }

  const stage = stages[0];

  // Generate high-res PNG from canvas
  const dataURL = stage.toDataURL({
    pixelRatio: quality,
    mimeType: 'image/png',
  });

  // Create PDF
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [stage.width(), stage.height()],
  });

  // Add the image to PDF
  pdf.addImage(
    dataURL,
    'PNG',
    0,
    0,
    stage.width(),
    stage.height()
  );

  // Save PDF
  pdf.save(filename);
}

export function downloadPdf(dataUrl: string, filename: string = 'toulmin-diagram.pdf'): void {
  // Convert data URL to blob
  const byteString = atob(dataUrl.split(',')[1]);
  const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mimeString });

  // Download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
