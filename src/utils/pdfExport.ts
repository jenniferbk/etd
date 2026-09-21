import { jsPDF } from 'jspdf';
import Konva from 'konva';
import type { DiagramElement, Connection } from '../types';
import { computeExportBounds } from './exportBounds';
import { saveFile } from './saveFile';
import { NOTE_BADGE_SELECTOR, withNodesHidden } from './exportHideNodes';

interface PdfExportOptions {
  filename?: string;
  orientation?: 'portrait' | 'landscape';
  quality?: number;
}

export async function exportToPdf(
  elements: DiagramElement[],
  connections: Connection[],
  options: PdfExportOptions = {},
): Promise<void> {
  const {
    filename = `toulmin-diagram-${Date.now()}.pdf`,
    orientation = 'landscape',
    quality = 2,
  } = options;

  const stages = Konva.stages;
  if (stages.length === 0) {
    throw new Error('No canvas found to export');
  }
  const stage = stages[0];

  const bounds = computeExportBounds(elements, connections);

  const dataURL = withNodesHidden(stage, NOTE_BADGE_SELECTOR, () =>
    stage.toDataURL({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      pixelRatio: quality,
      mimeType: 'image/png',
    }),
  );

  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [bounds.width, bounds.height],
  });

  pdf.addImage(dataURL, 'PNG', 0, 0, bounds.width, bounds.height);
  await saveFile({
    data: pdf.output('blob'),
    suggestedName: filename,
    mimeType: 'application/pdf',
    extension: '.pdf',
    description: 'PDF document',
  });
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
