import axios, { AxiosError } from "axios";
import { GEMINI_API_KEY, GEMINI_EMBED_URL } from "../config/env";
import { TextChunk } from "./chunkService";

export interface EmbeddedChunk extends TextChunk {
  vector: number[];
}

const MAX_BATCH_SIZE = 100; // Adjust based on API limits
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

export async function embedChunks(chunks: TextChunk[]): Promise<EmbeddedChunk[]> {
  if (!chunks || chunks.length === 0) {
    return [];
  }

  if (!GEMINI_EMBED_URL || !GEMINI_API_KEY) {
    throw new Error("Missing Gemini API configuration");
  }

  const embeddedChunks: EmbeddedChunk[] = [];
  
  // Process in batches to avoid API limits
  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + MAX_BATCH_SIZE);
    const texts = batch.map(c => c.text);
    
    try {
      const vectors = await embedTextsWithRetry(texts);
      
      for (let j = 0; j < batch.length; j++) {
        embeddedChunks.push({
          ...batch[j],
          vector: vectors[j] || []
        });
      }
      
      // Add small delay between batches
      if (i + MAX_BATCH_SIZE < chunks.length) {
        await sleep(100);
      }
    } catch (error) {
      console.error(`Failed to embed batch ${i}-${i + batch.length}:`, error);
      throw new Error(`Embedding failed for batch starting at index ${i}`);
    }
  }
  
  return embeddedChunks;
}

export async function embedQuery(query: string): Promise<number[]> {
  if (!query || query.trim().length === 0) {
    throw new Error("Query cannot be empty");
  }

  if (!GEMINI_EMBED_URL || !GEMINI_API_KEY) {
    throw new Error("Missing Gemini API configuration");
  }

  try {
    const vectors = await embedTextsWithRetry([query]);
    return vectors[0] || [];
  } catch (error) {
    console.error('Failed to embed query:', error);
    throw new Error('Failed to generate query embedding');
  }
}

async function embedTextsWithRetry(texts: string[]): Promise<number[][]> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        GEMINI_EMBED_URL,
        { input: texts },
        {
          headers: { 
            Authorization: `Bearer ${GEMINI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );
      
      const vectors = response.data?.data || response.data?.embeddings || [];
      
      if (!Array.isArray(vectors) || vectors.length !== texts.length) {
        throw new Error('Invalid embedding response format');
      }
      
      return vectors.map((v: any) => v?.embedding || v || []);
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        
        // Don't retry on client errors (except rate limiting)
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw new Error(`API error ${status}: ${error.response?.data?.message || error.message}`);
        }
      }
      
      if (isLastAttempt) {
        throw error;
      }
      
      console.warn(`Embedding attempt ${attempt} failed, retrying...`, error);
      await sleep(RETRY_DELAY * attempt);
    }
  }
  
  throw new Error('Max retries exceeded');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}