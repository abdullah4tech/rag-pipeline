import { QdrantClient } from "@qdrant/js-client-rest";
import { QDRANT_URL, QDRANT_API_KEY, COLLECTION_NAME, VECTOR_SIZE } from "./env";

let client: QdrantClient | null = null;

export async function initQdrant(): Promise<void> {
  if (!QDRANT_URL) {
    throw new Error("QDRANT_URL is required");
  }

  try {
    const config: any = { url: QDRANT_URL };
    
    // Add API key if provided
    if (QDRANT_API_KEY) {
      config.apiKey = QDRANT_API_KEY;
    }
    
    client = new QdrantClient(config);
    
    // Test connection
    await client.getCollections();
    console.log("✅ Connected to Qdrant successfully");
    
    // Ensure collection exists
    await ensureCollection();
  } catch (error) {
    console.error("❌ Failed to initialize Qdrant:", error);
    throw new Error(`Qdrant initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function ensureCollection(): Promise<void> {
  if (!client) {
    throw new Error("Qdrant client not initialized");
  }

  try {
    const collections = await client.getCollections();
    const exists = collections.collections?.some(
      (c) => c.name === COLLECTION_NAME
    );
    
    if (!exists) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: { 
          size: VECTOR_SIZE, 
          distance: "Cosine" 
        },
        optimizers_config: {
          default_segment_number: 2,
          max_segment_size: 20000,
        },
        replication_factor: 1,
      });
      console.log(`✅ Created Qdrant collection: ${COLLECTION_NAME}`);
    } else {
      console.log(`✅ Qdrant collection '${COLLECTION_NAME}' already exists`);
      
      // Verify vector configuration
      const collectionInfo = await client.getCollection(COLLECTION_NAME);
      const vectorConfig = collectionInfo.config?.params?.vectors;
      
      if (vectorConfig && typeof vectorConfig === 'object' && 'size' in vectorConfig) {
        const actualSize = vectorConfig.size;
        if (actualSize !== VECTOR_SIZE) {
          console.warn(`⚠️  Vector size mismatch: collection has ${actualSize}, config expects ${VECTOR_SIZE}`);
        }
      }
    }
  } catch (error) {
    console.error("❌ Failed to ensure collection:", error);
    throw new Error(`Collection setup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function getQdrant(): QdrantClient {
  if (!client) {
    throw new Error("Qdrant client not initialized. Call initQdrant() first.");
  }
  return client;
}

export async function healthCheck(): Promise<boolean> {
  if (!client) {
    return false;
  }
  
  try {
    await client.getCollections();
    return true;
  } catch {
    return false;
  }
}
