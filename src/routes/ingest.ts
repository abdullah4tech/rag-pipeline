import { Elysia, t } from "elysia";
import { pdfToPages, PdfPage } from "../services/pdfService";
import { chunkText } from "../services/chunkService";
import { embedChunks } from "../services/embedService";
import { upsertVectors, deleteDocumentVectors, searchVectors } from "../services/vectorService";
import { VECTOR_SIZE } from "../config/env";

interface IngestRequest {
  doc_id: string;
  pdf_base64: string;
  overwrite?: boolean;
  chunk_size?: number;
  chunk_overlap?: number;
}

interface IngestResponse {
  success: boolean;
  message: string;
  doc_id: string;
  total_chunks: number;
  total_pages: number;
  processing_time_ms: number;
}

export function ingestRoute() {
  return new Elysia()
    .post(
      "/ingest",
      async ({ body, set }) => {
        const startTime = Date.now();
        let doc_id: string = '';
        let overwrite: boolean = false;
        
        try {
          const requestData = body as IngestRequest;
          doc_id = requestData.doc_id;
          overwrite = requestData.overwrite || false;
          const { pdf_base64, chunk_size, chunk_overlap } = requestData;
          
          // Validation
          if (!doc_id.trim()) {
            set.status = 400;
            return { 
              success: false, 
              error: "doc_id cannot be empty",
              code: "INVALID_DOC_ID"
            };
          }
          
          if (!pdf_base64.trim()) {
            set.status = 400;
            return { 
              success: false, 
              error: "pdf_base64 cannot be empty",
              code: "INVALID_PDF_DATA"
            };
          }

          // Validate base64 format
          const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
          if (!base64Regex.test(pdf_base64)) {
            set.status = 400;
            return { 
              success: false, 
              error: "Invalid base64 format",
              code: "INVALID_BASE64"
            };
          }

          console.log(`📄 Starting ingestion for document: ${doc_id}`);
          
          // Check if document already exists (before any processing)
          let documentExists = false;
          if (overwrite) {
            try {
              // Check if document exists without deleting it yet
              const dummyVector = new Array(VECTOR_SIZE).fill(0);
              const existingVectors = await searchVectors(dummyVector, 1, doc_id);
              documentExists = existingVectors.length > 0;
              if (documentExists) {
                console.log(`� Document ${doc_id} exists and will be overwritten after successful processing`);
              }
            } catch (error) {
              console.warn(`⚠️  Could not check existing vectors: ${error}`);
            }
          } else {
            // Check if document already exists when overwrite is false
            try {
              const dummyVector = new Array(VECTOR_SIZE).fill(0);
              const existingVectors = await searchVectors(dummyVector, 1, doc_id);
              if (existingVectors.length > 0) {
                set.status = 400;
                return { 
                  success: false, 
                  error: `Document ${doc_id} already exists. Use overwrite=true to replace it.`,
                  code: "DOCUMENT_EXISTS"
                };
              }
            } catch (error) {
              console.warn(`⚠️  Could not check existing vectors: ${error}`);
            }
          }

          // Convert base64 to buffer with size validation
          let buffer: Buffer;
          try {
            buffer = Buffer.from(pdf_base64, "base64");
            
            // Check buffer size (e.g., max 50MB)
            const maxSize = 50 * 1024 * 1024;
            if (buffer.length > maxSize) {
              set.status = 413;
              return { 
                success: false, 
                error: `PDF file too large. Maximum size: ${maxSize / (1024 * 1024)}MB`,
                code: "FILE_TOO_LARGE"
              };
            }
          } catch (error) {
            set.status = 400;
            return { 
              success: false, 
              error: "Invalid base64 data",
              code: "DECODE_ERROR"
            };
          }

          // Extract pages from PDF
          console.log(`📖 Extracting pages from PDF...`);
          const pages: PdfPage[] = await pdfToPages(buffer);
          
          if (pages.length === 0) {
            set.status = 400;
            return { 
              success: false, 
              error: "No text content found in PDF",
              code: "EMPTY_PDF"
            };
          }

          // Chunk text from all pages
          console.log(`✂️  Chunking text from ${pages.length} pages...`);
          const allChunks = [];
          
          for (const page of pages) {
            if (page.text.trim().length === 0) {
              console.warn(`⚠️  Page ${page.page} is empty, skipping`);
              continue;
            }
            
            const chunks = await chunkText(page.text, { 
              docId: doc_id, 
              page: page.page,
              chunkSize: chunk_size,
              overlap: chunk_overlap
            });
            allChunks.push(...chunks);
          }

          if (allChunks.length === 0) {
            set.status = 400;
            return { 
              success: false, 
              error: "No chunks generated from PDF content",
              code: "NO_CHUNKS"
            };
          }

          console.log(`🧮 Generated ${allChunks.length} chunks`);

          // Generate embeddings BEFORE any storage operations
          console.log(`🔢 Generating embeddings...`);
          let embedded;
          try {
            embedded = await embedChunks(allChunks);
            
            // Validate ALL embeddings are successful
            const invalidEmbeddings = embedded.filter(chunk => !chunk.vector || chunk.vector.length === 0);
            if (invalidEmbeddings.length > 0) {
              console.error(`❌ ${invalidEmbeddings.length} chunks have invalid embeddings - aborting ingestion`);
              set.status = 500;
              return { 
                success: false, 
                error: `Failed to generate embeddings for ${invalidEmbeddings.length}/${embedded.length} chunks. No data has been stored.`,
                code: "EMBEDDING_ERROR"
              };
            }
            
            console.log(`✅ Successfully generated embeddings for all ${embedded.length} chunks`);
          } catch (error) {
            console.error(`❌ Embedding generation failed completely:`, error);
            
            // No cleanup needed here - we haven't deleted or stored anything yet
            // The existing document (if any) remains untouched
            console.log(`📋 Existing document ${doc_id} remains unchanged due to embedding failure`);
            
            set.status = 500;
            const errorMessage = error instanceof Error ? error.message : 'Unknown embedding error';
            return { 
              success: false, 
              error: `Embedding generation failed: ${errorMessage}. No data has been stored or modified.`,
              code: "EMBEDDING_ERROR"
            };
          }

          // Only store vectors if ALL embeddings were successful
          // Now it's safe to delete existing document since embeddings are ready
          if (overwrite && documentExists) {
            try {
              await deleteDocumentVectors(doc_id);
              console.log(`🗑️  Deleted existing vectors for document: ${doc_id}`);
            } catch (error) {
              console.warn(`⚠️  Could not delete existing vectors: ${error}`);
              // Continue anyway - upsert should handle duplicates
            }
          }
          
          console.log(`💾 Storing vectors in Qdrant...`);
          try {
            await upsertVectors(embedded);
            console.log(`✅ Successfully stored ${embedded.length} vectors`);
          } catch (storageError) {
            console.error(`❌ Vector storage failed:`, storageError);
            
            // Attempt to clean up any partial storage
            try {
              await deleteDocumentVectors(doc_id);
              console.log(`🧹 Cleaned up partial vector storage for document: ${doc_id}`);
            } catch (cleanupError) {
              console.warn(`⚠️  Could not clean up partial vector storage: ${cleanupError}`);
            }
            
            set.status = 500;
            const errorMessage = storageError instanceof Error ? storageError.message : 'Unknown storage error';
            return { 
              success: false, 
              error: `Vector storage failed: ${errorMessage}. No data has been stored.`,
              code: "STORAGE_ERROR"
            };
          }

          const processingTime = Date.now() - startTime;
          console.log(`✅ Ingestion completed in ${processingTime}ms`);

          const response: IngestResponse = {
            success: true,
            message: `Successfully ingested document with ${embedded.length} chunks from ${pages.length} pages`,
            doc_id,
            total_chunks: embedded.length,
            total_pages: pages.length,
            processing_time_ms: processingTime,
          };

          return response;
        } catch (error) {
          console.error(`❌ Ingestion failed:`, error);
          
          // Emergency cleanup only needed if we might have partially stored data
          // Check if error happened after we started vector operations
          const mainErrorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          if (mainErrorMessage.includes('storage') || mainErrorMessage.includes('upsert')) {
            if (overwrite) {
              try {
                await deleteDocumentVectors(doc_id);
                console.log(`🧹 Emergency cleanup completed for document: ${doc_id}`);
              } catch (cleanupError) {
                console.warn(`⚠️  Emergency cleanup failed: ${cleanupError}`);
              }
            }
          } else {
            console.log(`📋 No cleanup needed - existing document ${doc_id} remains unchanged`);
          }
          
          set.status = 500;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          
          // Determine specific error code based on error message
          let errorCode = "INGESTION_ERROR";
          if (errorMessage.includes("embedding") || errorMessage.includes("EMBEDDING")) {
            errorCode = "EMBEDDING_ERROR";
          } else if (errorMessage.includes("storage") || errorMessage.includes("STORAGE")) {
            errorCode = "STORAGE_ERROR";
          } else if (errorMessage.includes("PDF") || errorMessage.includes("parse")) {
            errorCode = "PDF_PROCESSING_ERROR";
          }
          
          return { 
            success: false, 
            error: `Ingestion failed: ${errorMessage}. No data has been stored.`,
            code: errorCode,
            processing_time_ms: Date.now() - startTime
          };
        }
      },
      {
        body: t.Object({ 
          doc_id: t.String({ minLength: 1, maxLength: 200 }), 
          pdf_base64: t.String({ minLength: 1 }),
          overwrite: t.Optional(t.Boolean()),
          chunk_size: t.Optional(t.Number({ minimum: 100, maximum: 2000 })),
          chunk_overlap: t.Optional(t.Number({ minimum: 0, maximum: 500 }))
        }),
      }
    )
    .get("/ingest/health", () => ({ 
      status: "healthy", 
      service: "ingest",
      timestamp: new Date().toISOString()
    }));
}
