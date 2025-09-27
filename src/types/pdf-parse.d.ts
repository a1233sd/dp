declare module 'pdf-parse' {
  export interface PDFParseOptions {
    max?: number;
    pagerender?: (pageData: unknown) => Promise<string> | string;
    version?: string;
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }

  export interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata?: unknown;
    text: string;
    version?: string;
  }

  export default function pdfParse(
    data: ArrayBuffer | Uint8Array | Buffer,
    options?: PDFParseOptions
  ): Promise<PDFParseResult>;
}

declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdfParse from 'pdf-parse';
  export * from 'pdf-parse';
  export default pdfParse;
}
