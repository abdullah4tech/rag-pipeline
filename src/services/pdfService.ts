// Using external PDF service API for reliable text extraction
export interface PdfPage {
  page: number;
  text: string;
}

interface PdfServiceResponse {
  pages: PdfPage[];
  total_pages: number;
  total_characters: number;
  extraction_method: string;
}

const PDF_SERVICE_URL = "https://pdfservice-abdullah4tech5930-55978wtf.leapcell.dev";

export async function pdfToPages(buffer: Buffer): Promise<PdfPage[]> {
  console.log("📖 Sending PDF to external extraction service...");
  
  try {
    // Create FormData with the PDF buffer
    const formData = new FormData();
    // Convert Buffer to Uint8Array for Blob compatibility
    const uint8Array = new Uint8Array(buffer);
    const pdfBlob = new Blob([uint8Array], { type: 'application/pdf' });
    formData.append('file', pdfBlob, 'document.pdf');
    
    console.log(`🌐 Making request to ${PDF_SERVICE_URL}/extract-pdf`);
    
    const response = await fetch(`${PDF_SERVICE_URL}/extract-pdf`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`PDF service returned ${response.status}: ${response.statusText}`);
    }
    
    const data: PdfServiceResponse = await response.json();
    
    if (!data.pages || data.pages.length === 0) {
      throw new Error("PDF service returned no pages");
    }
    
    const totalChars = data.total_characters || data.pages.reduce((sum, p) => sum + p.text.length, 0);
    
    console.log(`✅ Successfully extracted with ${data.extraction_method}: ${data.total_pages} pages, ${totalChars} characters`);
    
    // Validate that the extracted text looks reasonable
    const sampleText = data.pages[0].text.substring(0, 200);
    const validTextRatio = (sampleText.match(/[a-zA-Z\s]/g) || []).length / sampleText.length;
    
    if (validTextRatio < 0.6) {
      console.warn(`⚠️  Extracted text appears corrupted (${Math.round(validTextRatio * 100)}% valid text)`);
    }
    
    return data.pages;
    
  } catch (error) {
    console.error("❌ External PDF service failed:", error);
    
    // Provide helpful error message
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error("Could not connect to PDF extraction service. Please check your internet connection.");
    }
    
    throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}


