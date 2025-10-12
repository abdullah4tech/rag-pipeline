import { Elysia, t } from "elysia";
import { pdfToPages, PdfPage } from "../services/pdfService";
import { chunkText } from "../services/chunkService";
import { embedChunks } from "../services/embedService";
import { upsertVectors, deleteDocumentVectors } from "../services/vectorService";

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
        
        try {
          const { doc_id, pdf_base64, overwrite = false, chunk_size, chunk_overlap } = body as IngestRequest;
          
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
          
          // Delete existing vectors if overwrite is enabled
          if (overwrite) {
            try {
              await deleteDocumentVectors(doc_id);
              console.log(`🗑️  Deleted existing vectors for document: ${doc_id}`);
            } catch (error) {
              console.warn(`⚠️  Could not delete existing vectors (might not exist): ${error}`);
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

          // Generate embeddings
          console.log(`🔢 Generating embeddings...`);
          const embedded = await embedChunks(allChunks);
          
          // Validate embeddings
          const invalidEmbeddings = embedded.filter(chunk => !chunk.vector || chunk.vector.length === 0);
          if (invalidEmbeddings.length > 0) {
            console.error(`❌ ${invalidEmbeddings.length} chunks have invalid embeddings`);
            set.status = 500;
            return { 
              success: false, 
              error: `Failed to generate embeddings for ${invalidEmbeddings.length} chunks`,
              code: "EMBEDDING_ERROR"
            };
          }

          // Store vectors in Qdrant
          console.log(`💾 Storing vectors in Qdrant...`);
          await upsertVectors(embedded);

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
          set.status = 500;
          
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          return { 
            success: false, 
            error: `Ingestion failed: ${errorMessage}`,
            code: "INGESTION_ERROR",
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
