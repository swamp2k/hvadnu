import type { DocumentKind, ExtractedDocument } from '../domain/document';

export const MAX_LOCAL_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_LOCAL_PDF_PAGES = 300;

export interface LocalFileDescriptor {
  name: string;
  type: string;
  size: number;
}

export function detectDocumentKind(name: string, mimeType: string): DocumentKind | null {
  const lower = name.toLowerCase();
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) return 'docx';
  if (mimeType.startsWith('text/') || /\.(txt|md|csv|log)$/u.test(lower)) return 'text';
  return null;
}

export function assertLocalDocumentAllowed(file: LocalFileDescriptor): DocumentKind {
  const kind = detectDocumentKind(file.name, file.type);
  if (!kind) throw new Error('Filtypen understøttes ikke endnu. Brug PDF, DOCX eller tekst.');
  if (file.size <= 0) throw new Error('Filen er tom.');
  if (file.size > MAX_LOCAL_FILE_BYTES) {
    throw new Error('Filen er over 25 MB og behandles ikke lokalt på mobilen i denne version.');
  }
  return kind;
}

function cleanText(value: string): string {
  return value.replace(/\u0000/gu, '').replace(/[ \t]+\n/gu, '\n').replace(/\n{4,}/gu, '\n\n\n').trim();
}

async function extractPdf(file: File): Promise<ExtractedDocument> {
  const [{ getDocument, GlobalWorkerOptions }, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  if (pdf.numPages > MAX_LOCAL_PDF_PAGES) {
    await pdf.destroy();
    throw new Error(`PDF'en har ${pdf.numPages} sider. Lokal preview er begrænset til ${MAX_LOCAL_PDF_PAGES} sider for ikke at fryse telefonen.`);
  }

  const pages: ExtractedDocument['pages'] = [];
  const warnings: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = cleanText(content.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' '));
      pages.push({ pageNumber, text });
    }
  } finally {
    await pdf.destroy();
  }

  const characterCount = pages.reduce((sum, page) => sum + page.text.length, 0);
  if (characterCount < Math.max(40, pages.length * 10)) {
    warnings.push('Der blev fundet meget lidt maskinlæsbar tekst. Dokumentet kan være scannet og kræve OCR/vision.');
  }

  return {
    name: file.name,
    mimeType: file.type || 'application/pdf',
    kind: 'pdf',
    sizeBytes: file.size,
    pageCount: pages.length,
    characterCount,
    pages,
    warnings,
  };
}

async function extractDocx(file: File): Promise<ExtractedDocument> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = cleanText(result.value);
  const warnings = result.messages.map((message) => `DOCX: ${message.message}`);
  if (!text) warnings.push('DOCX-filen gav ingen maskinlæsbar tekst.');

  return {
    name: file.name,
    mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'docx',
    sizeBytes: file.size,
    pageCount: 1,
    characterCount: text.length,
    pages: [{ pageNumber: 1, text }],
    warnings,
  };
}

async function extractText(file: File): Promise<ExtractedDocument> {
  const text = cleanText(await file.text());
  return {
    name: file.name,
    mimeType: file.type || 'text/plain',
    kind: 'text',
    sizeBytes: file.size,
    pageCount: 1,
    characterCount: text.length,
    pages: [{ pageNumber: 1, text }],
    warnings: text ? [] : ['Tekstfilen indeholder ingen læsbar tekst.'],
  };
}

export async function extractDocumentLocally(file: File): Promise<ExtractedDocument> {
  const kind = assertLocalDocumentAllowed(file);
  if (kind === 'pdf') return extractPdf(file);
  if (kind === 'docx') return extractDocx(file);
  return extractText(file);
}
