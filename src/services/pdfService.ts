import { PDFParse } from "pdf-parse"

export interface PdfPage {
  page: number;
  text: string;
}

export async function pdfToPages(buffer: Buffer): Promise<PdfPage[]> {
  try {
    const data = await PDFParse(buffer);
    const text = data.text || "";
    
    // Try to split by common page break indicators
    const pageBreaks = text.split(/\n\s*(?:Page\s+\d+|\f|\n\n\n)/gi);
    
    if (pageBreaks.length > 1) {
      return pageBreaks
        .map((pageText: string, index: number) => ({
          page: index + 1,
          text: pageText.trim()
        }))
        .filter((page: PdfPage) => page.text.length > 0);
    }
    
    // Fallback: treat entire doc as single page
    return [{ page: 1, text }];
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF document');
  }
}
