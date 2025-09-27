import path from 'node:path';
import type { Buffer as NodeBuffer } from 'node:buffer';
import type { PDFParseOptions, PDFParseResult } from 'pdf-parse';
import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((module) => {
      module.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
      (module.GlobalWorkerOptions as unknown as { standardFontDataUrl: string }).standardFontDataUrl = `${path.join(
        process.cwd(),
        'node_modules/pdfjs-dist/standard_fonts'
      )}${path.sep}`;
      return module;
    });
  }
  return pdfjsPromise;
}

function toUint8Array(data: ArrayBuffer | Uint8Array | Buffer): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
    const bufferData = data as NodeBuffer;
    const copy = new Uint8Array(bufferData.length);
    copy.set(bufferData);
    return copy;
  }
  return new Uint8Array(data);
}

function isTextItem(item: unknown): item is TextItem {
  return Boolean(item) && typeof (item as TextItem).str === 'string';
}

async function extractText(doc: PDFDocumentProxy): Promise<string> {
  let collected = '';

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => (isTextItem(item) ? item.str : ''))
      .join(' ')
      .trim();
    if (pageText) {
      collected = collected ? `${collected}\n${pageText}` : pageText;
    }
  }

  await doc.cleanup();
  return collected;
}

export async function parsePdf(
  data: ArrayBuffer | Uint8Array | Buffer,
  _options?: PDFParseOptions
): Promise<PDFParseResult> {
  const pdfjs = await loadPdfJs();
  const uint8 = toUint8Array(data);
  const loadingTask = pdfjs.getDocument({ data: uint8 });

  try {
    const doc = await loadingTask.promise;
    const text = await extractText(doc);
    let metadataInfo: Record<string, unknown> = {};
    let metadata: unknown = undefined;

    if (typeof doc.getMetadata === 'function') {
      try {
        const meta = await doc.getMetadata();
        metadataInfo = (meta.info ?? {}) as Record<string, unknown>;
        metadata = meta.metadata ?? undefined;
      } catch {
        metadataInfo = {};
        metadata = undefined;
      }
    }

    return {
      text,
      numpages: doc.numPages,
      numrender: doc.numPages,
      info: metadataInfo,
      metadata,
      version: undefined,
    };
  } finally {
    loadingTask.destroy();
  }
}
