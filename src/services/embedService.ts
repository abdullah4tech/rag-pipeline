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
    
    // Validate batch embeddings before continuing
    for (let j = 0; j < batch.length; j++) {
      const vector = batchVectors[j];
      if (!vector || vector.length === 0) {
        throw new Error(`Failed to generate embedding for chunk ${i + j + 1}/${chunks.length}: empty vector received`);
      }
      
      embeddedChunks.push({
        ...batch[j],
        vector: vector
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
      const embeddings = response.embeddings.map((embedding, index) => {
        if (!embedding.values || embedding.values.length === 0) {
          throw new Error(`Embedding values missing for text ${index + 1}/${texts.length}`);
        }
        return embedding.values;
      });

      console.log(`✅ Successfully generated ${embeddings.length} embeddings with dimension ${embeddings[0]?.length || 0}`);
      
      // Validate all embeddings have the same dimension
      const expectedDimension = embeddings[0]?.length || 0;
      for (let i = 0; i < embeddings.length; i++) {
        if (embeddings[i].length !== expectedDimension) {
          throw new Error(`Embedding dimension mismatch for text ${i + 1}: expected ${expectedDimension}, got ${embeddings[i].length}`);
        }
      }

      return embeddings;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Gemini embedding attempt ${attempt}/${MAX_RETRIES} failed:`, {
        error: errorMessage,
        textsCount: texts.length,
        attempt: attempt
      });

      // Don't retry on authentication/authorization errors
      if (error instanceof Error) {
        if (errorMessage.includes('400') || errorMessage.includes('401') || errorMessage.includes('403') || 
            errorMessage.includes('API_KEY') || errorMessage.includes('permission')) {
          throw new Error(`Authentication/Authorization error: ${errorMessage}`);
        }
        
        // Don't retry on quota/rate limit exceeded (different from temporary rate limiting)
        if (errorMessage.includes('quota') || errorMessage.includes('exceeded')) {
          throw new Error(`API quota exceeded: ${errorMessage}`);
        }
      }

      // This is the last attempt
      if (attempt === MAX_RETRIES) {
        throw new Error(`Embedding generation failed after ${MAX_RETRIES} attempts: ${errorMessage}`);
      }

      // Retry on temporary errors (rate limiting, server errors, network issues)
      const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
      console.log(`⏳ Retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error("Max retries exceeded for Gemini embeddings");
}