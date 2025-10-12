import { Elysia, t } from "elysia";
import { embedQuery } from "../services/embedService";
import { searchVectors, getCollectionInfo } from "../services/vectorService";
import { generateAnswer, GeneratedAnswer } from "../services/geminiService";

interface QueryRequest {
  question: string;
  top_k?: number;
  doc_id?: string; // Filter by specific document
  min_score?: number; // Minimum relevance score
}

interface QueryResponse {
  success: boolean;
  answer: GeneratedAnswer;
  query_time_ms: number;
  total_results: number;
}

export function queryRoute() {
  return new Elysia()
    .post(
      "/query",
      async ({ body, set }) => {
        const startTime = Date.now();
        
        try {
          const { question, top_k = 5, doc_id, min_score = 0.0 } = body as QueryRequest;
          
          // Validation
          if (!question || question.trim().length === 0) {
            set.status = 400;
            return { 
              success: false, 
              error: "Question cannot be empty",
              code: "INVALID_QUESTION"
            };
          }

          if (question.length > 1000) {
            set.status = 400;
            return { 
              success: false, 
              error: "Question too long (max 1000 characters)",
              code: "QUESTION_TOO_LONG"
            };
          }

          if (top_k <= 0 || top_k > 50) {
            set.status = 400;
            return { 
              success: false, 
              error: "top_k must be between 1 and 50",
              code: "INVALID_TOP_K"
            };
          }

          if (min_score < 0 || min_score > 1) {
            set.status = 400;
            return { 
              success: false, 
              error: "min_score must be between 0 and 1",
              code: "INVALID_MIN_SCORE"
            };
          }

          console.log(`🔍 Processing query: "${question.substring(0, 100)}${question.length > 100 ? '...' : ''}"`);
          
          // Generate query embedding
          console.log(`🔢 Generating query embedding...`);
          const queryEmbedding = await embedQuery(question);
          
          if (!queryEmbedding || queryEmbedding.length === 0) {
            set.status = 500;
            return { 
              success: false, 
              error: "Failed to generate query embedding",
              code: "EMBEDDING_ERROR"
            };
          }

          // Search for similar vectors
          console.log(`🔍 Searching for similar vectors (top_k=${top_k})...`);
          const searchResults = await searchVectors(queryEmbedding, top_k, doc_id);
          
          // Filter by minimum score
          const filteredResults = searchResults.filter(result => result.score >= min_score);
          
          if (filteredResults.length === 0) {
            const response: QueryResponse = {
              success: true,
              answer: {
                text: "I couldn't find any relevant information to answer your question. Please try rephrasing your question or check if the relevant documents have been ingested.",
                sources: [],
                confidence: 0
              },
              query_time_ms: Date.now() - startTime,
              total_results: 0
            };
            return response;
          }

          console.log(`✨ Found ${filteredResults.length} relevant chunks, generating answer...`);
          
          // Generate answer using AI
          const answer = await generateAnswer(question, filteredResults);

          const queryTime = Date.now() - startTime;
          console.log(`✅ Query completed in ${queryTime}ms`);

          const response: QueryResponse = {
            success: true,
            answer,
            query_time_ms: queryTime,
            total_results: filteredResults.length
          };

          return response;
        } catch (error) {
          console.error(`❌ Query failed:`, error);
          set.status = 500;
          
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          return { 
            success: false, 
            error: `Query failed: ${errorMessage}`,
            code: "QUERY_ERROR",
            query_time_ms: Date.now() - startTime
          };
        }
      },
      {
        body: t.Object({ 
          question: t.String({ minLength: 1, maxLength: 1000 }), 
          top_k: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
          doc_id: t.Optional(t.String()),
          min_score: t.Optional(t.Number({ minimum: 0, maximum: 1 }))
        }),
      }
    )
    .get("/query/health", () => ({ 
      status: "healthy", 
      service: "query",
      timestamp: new Date().toISOString()
    }))
    .get("/query/stats", async ({ set }) => {
      try {
        const collectionInfo = await getCollectionInfo();
        return {
          success: true,
          collection_stats: collectionInfo,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: "STATS_ERROR"
        };
      }
    });
}
