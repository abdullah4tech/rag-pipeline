import { getQdrant, initQdrant } from "../config/qdrant";
import { EmbeddedChunk } from "./embedService";
import { COLLECTION_NAME, VECTOR_SIZE } from "../config/env";
import { randomUUID } from "crypto";

const COLLECTION = COLLECTION_NAME;
const BATCH_SIZE = 100; // Qdrant batch size limit

async function ensureCollectionExists(): Promise<void> {
  try {
    const client = getQdrant();
    await client.getCollection(COLLECTION);
  } catch (error) {
    console.log(`🔄 Collection '${COLLECTION}' not found, initializing Qdrant...`);
    await initQdrant();
  }
}

export interface SearchResult {
  id: string;
  score: number;
  payload: {
    text: string;
    doc_id: string;
    page: number;
    chunk_index: number;
  };
}

export async function upsertVectors(points: EmbeddedChunk[]): Promise<void> {
  if (!points || points.length === 0) {
    console.warn('No points to upsert');
    return;
  }

  // Ensure collection exists (auto-create if needed)
  await ensureCollectionExists();
  
  const client = getQdrant();
  
  // Verify collection exists and configuration
  try {
    const collectionInfo = await client.getCollection(COLLECTION);
    console.log(`📊 Collection '${COLLECTION}' info:`, {
      status: collectionInfo.status,
      vectorsCount: collectionInfo.vectors_count,
      pointsCount: collectionInfo.points_count,
      vectorSize: collectionInfo.config?.params?.vectors?.size,
      distance: collectionInfo.config?.params?.vectors?.distance
    });
  } catch (error) {
    console.error(`❌ Failed to get collection info for '${COLLECTION}':`, error);
    throw new Error(`Collection '${COLLECTION}' not accessible: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Process in batches to avoid API limits
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    
    const payload = batch.map((p, batchIndex) => {
      // Validate vector
      if (!p.vector || p.vector.length === 0) {
        throw new Error(`Invalid vector for point ${p.id} at batch index ${batchIndex}: vector is empty or undefined`);
      }
      
      if (p.vector.length !== VECTOR_SIZE) {
        throw new Error(`Invalid vector dimension for point ${p.id} at batch index ${batchIndex}: expected ${VECTOR_SIZE}, got ${p.vector.length}`);
      }
      
      // Check for invalid numbers
      const hasInvalidNumbers = p.vector.some(v => !isFinite(v) || isNaN(v));
      if (hasInvalidNumbers) {
        throw new Error(`Invalid vector values for point ${p.id} at batch index ${batchIndex}: contains NaN or infinite values`);
      }
      
      // Validate required fields
      if (!p.id || !p.text || !p.doc_id) {
        throw new Error(`Missing required fields for point at batch index ${batchIndex}: id=${p.id}, text length=${p.text?.length || 0}, doc_id=${p.doc_id}`);
      }
      
      // Validate ID format (Qdrant has limits on ID length and characters)
      if (p.id.length > 255) {
        throw new Error(`Point ID too long at batch index ${batchIndex}: ${p.id.length} characters (max 255)`);
      }
      
      // Generate a UUID for Qdrant (required format)
      const uuidId = randomUUID();
      
      return {
        id: uuidId,
        vector: p.vector,
        payload: {
          original_id: p.id, // Keep original ID in payload for reference
          text: p.text,
          doc_id: p.doc_id,
          page: p.page || 0,
          chunk_index: p.chunk_index || 0,
          created_at: new Date().toISOString(),
        },
      };
    });
    
    try {
      // Validate batch before sending
      console.log(`🔍 Validating batch ${i + 1}-${Math.min(i + BATCH_SIZE, points.length)}:`);
      console.log(`  - Batch size: ${batch.length}`);
      console.log(`  - Vector dimensions: ${batch[0]?.vector?.length || 'undefined'}`);
      console.log(`  - Sample payload:`, JSON.stringify(payload[0], null, 2));
      
      await client.upsert(COLLECTION, {
        points: payload,
      });
      
      console.log(`✅ Upserted batch ${i + 1}-${Math.min(i + BATCH_SIZE, points.length)} of ${points.length} points`);
    } catch (error) {
      console.error(`❌ Failed to upsert batch ${i}-${i + batch.length}:`);
      console.error(`  - Error:`, error);
      
      // Extract more details from Qdrant error
      if (error && typeof error === 'object' && 'data' in error) {
        console.error(`  - Qdrant response data:`, JSON.stringify((error as any).data, null, 2));
      }
      
      console.error(`  - Batch details:`, {
        batchSize: batch.length,
        vectorDimensions: batch.map(p => p.vector?.length || 0),
        sampleIds: batch.slice(0, 3).map(p => p.id),
        samplePayload: payload.slice(0, 1).map(p => ({
          id: p.id,
          vectorLength: p.vector.length,
          payloadKeys: Object.keys(p.payload)
        }))
      });
      
      // Try a smaller batch to isolate the issue
      if (batch.length > 1) {
        console.log(`🔄 Trying smaller batch size to isolate the issue...`);
        try {
          // Try just the first point
          const singlePoint = [payload[0]];
          await client.upsert(COLLECTION, {
            points: singlePoint,
          });
          console.log(`✅ Single point upsert succeeded - issue might be batch size`);
        } catch (singleError) {
          console.error(`❌ Single point upsert also failed:`, singleError);
          if (singleError && typeof singleError === 'object' && 'data' in singleError) {
            console.error(`  - Single point Qdrant response:`, JSON.stringify((singleError as any).data, null, 2));
          }
        }
      }
      
      throw new Error(`Vector upsert failed for batch starting at index ${i}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function searchVectors(vector: number[], topK = 5, docId?: string): Promise<SearchResult[]> {
  if (!vector || vector.length === 0) {
    throw new Error('Search vector cannot be empty');
  }

  if (topK <= 0 || topK > 100) {
    throw new Error('topK must be between 1 and 100');
  }

  // Ensure collection exists (auto-create if needed)
  await ensureCollectionExists();

  const client = getQdrant();
  
  try {
    const result = await client.search(COLLECTION, {
      vector,
      limit: topK,
      with_payload: true,
      filter: docId ? {
        must: [
          {
            key: "doc_id",
            match: { value: docId }
          }
        ]
      } : undefined,
    });
    
    return result.map((r) => ({
      id: r.id as string,
      score: r.score || 0,
      payload: r.payload as SearchResult['payload'],
    }));
  } catch (error) {
    console.error('Vector search failed:', error);
    throw new Error('Failed to search vectors');
  }
}

export async function deleteDocumentVectors(docId: string): Promise<void> {
  if (!docId) {
    throw new Error('Document ID is required for deletion');
  }

  const client = getQdrant();
  
  try {
    await client.delete(COLLECTION, {
      filter: {
        must: [
          {
            key: "doc_id",
            match: { value: docId }
          }
        ]
      }
    });
    
    console.log(`✅ Deleted vectors for document: ${docId}`);
  } catch (error) {
    console.error(`❌ Failed to delete vectors for document ${docId}:`, error);
    throw new Error(`Failed to delete vectors for document ${docId}`);
  }
}

export async function getCollectionInfo() {
  const client = getQdrant();
  
  try {
    const info = await client.getCollection(COLLECTION);
    return {
      status: info.status,
      vectorsCount: info.vectors_count,
      pointsCount: info.points_count,
      config: info.config,
    };
  } catch (error) {
    console.error('Failed to get collection info:', error);
    throw new Error('Failed to retrieve collection information');
  }
}
