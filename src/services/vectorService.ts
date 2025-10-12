import { getQdrant } from "../config/qdrant";
import { EmbeddedChunk } from "./embedService";
import { COLLECTION_NAME } from "../config/env";

const COLLECTION = COLLECTION_NAME;
const BATCH_SIZE = 100; // Qdrant batch size limit

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

  const client = getQdrant();
  
  // Process in batches to avoid API limits
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    
    const payload = batch.map((p) => {
      if (!p.vector || p.vector.length === 0) {
        throw new Error(`Invalid vector for point ${p.id}`);
      }
      
      return {
        id: p.id,
        vector: p.vector,
        payload: {
          text: p.text,
          doc_id: p.doc_id,
          page: p.page,
          chunk_index: p.chunk_index,
          created_at: new Date().toISOString(),
        },
      };
    });
    
    try {
      await client.upsert(COLLECTION, {
        points: payload,
      });
      
      console.log(`Upserted batch ${i + 1}-${Math.min(i + BATCH_SIZE, points.length)} of ${points.length} points`);
    } catch (error) {
      console.error(`Failed to upsert batch ${i}-${i + batch.length}:`, error);
      throw new Error(`Vector upsert failed for batch starting at index ${i}`);
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
    
    console.log(`Deleted vectors for document: ${docId}`);
  } catch (error) {
    console.error(`Failed to delete vectors for document ${docId}:`, error);
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
