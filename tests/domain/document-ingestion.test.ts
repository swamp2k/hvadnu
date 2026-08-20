import { describe, expect, it } from 'vitest';
import {
  assertLocalDocumentAllowed,
  detectDocumentKind,
  MAX_LOCAL_DOCX_BYTES,
  MAX_LOCAL_FILE_BYTES,
} from '../../src/documents/extract-document';
import { explainSyntheticDocument } from '../../src/documents/synthetic-document';

describe('document ingestion contracts', () => {
  it('detects supported local document formats without trusting MIME alone', () => {
    expect(detectDocumentKind('brev.PDF', '')).toBe('pdf');
    expect(detectDocumentKind('aftale.docx', 'application/octet-stream')).toBe('docx');
    expect(detectDocumentKind('noter.txt', '')).toBe('text');
    expect(detectDocumentKind('gammel.doc', 'application/msword')).toBeNull();
  });

  it('rejects unsupported and oversized files before parsing', () => {
    expect(() => assertLocalDocumentAllowed({ name: 'scan.jpg', type: 'image/jpeg', size: 1200 })).toThrow(/understøttes ikke/u);
    expect(() => assertLocalDocumentAllowed({ name: 'stor.pdf', type: 'application/pdf', size: MAX_LOCAL_FILE_BYTES + 1 })).toThrow(/25 MB/u);
    expect(() => assertLocalDocumentAllowed({ name: 'stor.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: MAX_LOCAL_DOCX_BYTES + 1 })).toThrow(/10 MB/u);
  });

  it('keeps the synthetic lawyer letter classified as a proposal', () => {
    const result = explainSyntheticDocument();
    expect(result.documentType).toBe('lawyer_letter');
    expect(result.sourceStatus).toBe('proposal');
    expect(result.summary).toMatch(/ikke en allerede indgået aftale/u);
    expect(result.uncertainty.some((item) => item.includes('accepteret'))).toBe(true);
  });
});
