import { encode } from "gpt-3-encoder";

export interface ChunkOptions {
  docId: string;
  page?: number;
  chunkSize?: number; // tokens
  overlap?: number; // tokens
}

export interface TextChunk {
  id: string;
  text: string;
  doc_id: string;
  page: number;
  chunk_index: number;
}

export async function chunkText(text: string, opts: ChunkOptions): Promise<TextChunk[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunkSize = opts.chunkSize || 800; // Reduced for better context
  const overlap = opts.overlap || 100;
  
  try {
    // Use proper tokenization
    const tokens = encode(text);
    const chunks: TextChunk[] = [];
    let idx = 0;
    
    for (let i = 0; i < tokens.length; i += chunkSize - overlap) {
      const chunkTokens = tokens.slice(i, i + chunkSize);
      
      // Convert tokens back to text (simple approach)
      // For production, use proper detokenization
      const chunkText = text.substring(
        Math.floor((i / tokens.length) * text.length),
        Math.floor(((i + chunkTokens.length) / tokens.length) * text.length)
      ).trim();
      
      if (chunkText.length > 0) {
        chunks.push({
          id: `${opts.docId}:${opts.page || 0}:${idx}`,
          text: chunkText,
          doc_id: opts.docId,
          page: opts.page || 0,
          chunk_index: idx,
        });
        idx++;
      }
    }
    
    return chunks;
  } catch (error) {
    console.error('Error chunking text:', error);
    throw error;
  }
}
