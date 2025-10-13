import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY } from "../config/env";
import { TextChunk } from "./chunkService";

export interface EmbeddedChunk extends TextChunk {
  vector: number[];
}

const MAX_BATCH_SIZE = 10; // Conservative batch size for stability
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // ms

export async function embedChunks(chunks: TextChunk[]): Promise<EmbeddedChunk[]> {
  if (!chunks || chunks.length === 0) {
    return [];
  }

  console.log('🤖 Generating Gemini embeddings...');
  return await embedChunksWithGemini(chunks);
}

export async function embedQuery(query: string): Promise<number[]> {
  if (!query || query.trim().length === 0) {
    throw new Error("Query cannot be empty");
  }

  console.log('🤖 Generating Gemini embeddings for query...');
  return await embedQueryWithGemini(query);
}

async function embedChunksWithGemini(chunks: TextChunk[]): Promise<EmbeddedChunk[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const embeddedChunks: EmbeddedChunk[] = [];
  
  // Process in batches to avoid API limits
  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + MAX_BATCH_SIZE);
    console.log(`🤖 Processing batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}/${Math.ceil(chunks.length / MAX_BATCH_SIZE)} (${batch.length} chunks)`);
    
    const batchVectors = await embedTextsWithGemini(batch.map(c => c.text));
    
    for (let j = 0; j < batch.length; j++) {
      embeddedChunks.push({
        ...batch[j],
        vector: batchVectors[j] || []
      });
    }
    
    // Rate limiting between batches
    if (i + MAX_BATCH_SIZE < chunks.length) {
      console.log('⏳ Waiting between batches...');
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
  
  console.log(`✅ Created ${embeddedChunks.length} Gemini embeddings`);
  return embeddedChunks;
}

async function embedQueryWithGemini(query: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const vectors = await embedTextsWithGemini([query]);
  return vectors[0] || [];
}

async function embedTextsWithGemini(texts: string[]): Promise<number[][]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const ai = new GoogleGenAI({});

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🤖 Generating embeddings for ${texts.length} texts (attempt ${attempt}/${MAX_RETRIES})`);
      
      // Use batch embedding for all cases
      const response = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: texts
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error("Invalid embedding response format");
      }

      // Ensure all embeddings have values
      const embeddings = response.embeddings.map(embedding => {
        if (!embedding.values) {
          throw new Error("Embedding values are missing");
        }
        return embedding.values;
      });

      return embeddings;

    } catch (error) {
      console.error(`❌ Gemini embedding attempt ${attempt}/${MAX_RETRIES} failed:`, {
        error: error instanceof Error ? error.message : String(error),
        textsCount: texts.length
      });

      // Don't retry on certain errors
      if (error instanceof Error) {
        if (error.message.includes('400') || error.message.includes('401') || error.message.includes('403')) {
          throw error;
        }
      }

      // Retry on rate limiting or server errors
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw new Error("Max retries exceeded for Gemini embeddings");
}