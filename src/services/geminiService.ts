import axios, { AxiosError } from "axios";
import { GEMINI_API_KEY, GEMINI_GEN_URL } from "../config/env";
import { SearchResult } from "./vectorService";

export interface GeneratedAnswer {
  text: string;
  sources: Array<{
    doc_id: string;
    page: number;
    relevanceScore: number;
  }>;
  confidence: number;
}

const MAX_CONTEXT_LENGTH = 8000; // Adjust based on model limits
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export async function generateAnswer(question: string, hits: SearchResult[]): Promise<GeneratedAnswer> {
  if (!question || question.trim().length === 0) {
    throw new Error("Question cannot be empty");
  }

  if (!GEMINI_GEN_URL || !GEMINI_API_KEY) {
    throw new Error("Missing Gemini API configuration");
  }

  if (!hits || hits.length === 0) {
    return {
      text: "I couldn't find relevant information to answer your question. Please try rephrasing your question or check if the document has been properly ingested.",
      sources: [],
      confidence: 0
    };
  }

  // Filter and prepare context with relevance threshold
  const relevantHits = hits.filter(h => h.score > 0.7); // Adjust threshold as needed
  
  if (relevantHits.length === 0) {
    return {
      text: "I found some potentially related content, but it doesn't seem directly relevant to your question. Please try rephrasing your question.",
      sources: hits.slice(0, 3).map(h => ({
        doc_id: h.payload.doc_id,
        page: h.payload.page,
        relevanceScore: h.score
      })),
      confidence: 0.3
    };
  }

  const context = buildContext(relevantHits);
  const prompt = buildPrompt(question, context);

  try {
    const response = await generateWithRetry(prompt);
    
    return {
      text: response,
      sources: relevantHits.map((h) => ({
        doc_id: h.payload.doc_id,
        page: h.payload.page,
        relevanceScore: h.score,
      })),
      confidence: calculateConfidence(relevantHits)
    };
  } catch (error) {
    console.error('Failed to generate answer:', error);
    throw new Error('Failed to generate answer using AI model');
  }
}

function buildContext(hits: SearchResult[]): string {
  let context = "";
  let currentLength = 0;
  
  for (let i = 0; i < hits.length && currentLength < MAX_CONTEXT_LENGTH; i++) {
    const hit = hits[i];
    const source = `[Source: ${hit.payload.doc_id}, Page ${hit.payload.page}, Relevance: ${hit.score.toFixed(2)}]`;
    const content = `${source}\n${hit.payload.text}\n\n`;
    
    if (currentLength + content.length > MAX_CONTEXT_LENGTH) {
      // Truncate if necessary
      const remaining = MAX_CONTEXT_LENGTH - currentLength;
      if (remaining > 100) { // Only add if there's meaningful space
        context += source + "\n" + hit.payload.text.substring(0, remaining - source.length - 10) + "...\n\n";
      }
      break;
    }
    
    context += content;
    currentLength += content.length;
  }
  
  return context.trim();
}

function buildPrompt(question: string, context: string): string {
  return `You are a helpful AI assistant that answers questions based on provided context. Follow these guidelines:

1. Answer based ONLY on the provided context
2. If the context doesn't contain enough information, say so clearly
3. Cite specific sources in your answer using [Source: doc_id, Page X] format
4. Be concise but comprehensive
5. If multiple sources contain relevant information, synthesize them appropriately

Context:
${context}

Question: ${question}

Answer:`;
}

function calculateConfidence(hits: SearchResult[]): number {
  if (!hits || hits.length === 0) return 0;
  
  const avgScore = hits.reduce((sum, hit) => sum + hit.score, 0) / hits.length;
  const topScore = hits[0]?.score || 0;
  
  // Simple confidence calculation based on scores
  return Math.min(0.95, (avgScore + topScore) / 2);
}

async function generateWithRetry(prompt: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Try different possible API formats for Gemini
      const payloads = [
        {
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.2,
          }
        },
        {
          prompt,
          model: "gemini-2.5-pro",
          max_output_tokens: 800,
          temperature: 0.2,
        },
        {
          input: prompt,
          parameters: {
            max_new_tokens: 800,
            temperature: 0.2,
          }
        }
      ];

      for (const payload of payloads) {
        try {
          const response = await axios.post(GEMINI_GEN_URL, payload, {
            headers: { 
              Authorization: `Bearer ${GEMINI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          });

          // Try different response formats
          const text = extractTextFromResponse(response.data);
          if (text && text.trim().length > 0) {
            return text.trim();
          }
        } catch (payloadError) {
          console.warn(`Payload format failed:`, payloadError);
          continue;
        }
      }
      
      throw new Error('All payload formats failed');
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate response after ${MAX_RETRIES} attempts: ${errorMessage}`);
      }
      
      console.warn(`Generation attempt ${attempt} failed, retrying...`);
      await sleep(RETRY_DELAY * attempt);
    }
  }
  
  throw new Error('Max retries exceeded');
}

function extractTextFromResponse(data: any): string {
  // Try various response formats
  const candidates = [
    data?.candidates?.[0]?.content?.parts?.[0]?.text,
    data?.candidates?.[0]?.content,
    data?.candidates?.[0]?.output,
    data?.output_text,
    data?.generated_text,
    data?.text,
    data?.content,
  ];
  
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  
  throw new Error('Could not extract text from API response');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
