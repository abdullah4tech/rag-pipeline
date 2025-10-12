import "dotenv/config";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { ingestRoute } from "./routes/ingest";
import { queryRoute } from "./routes/query";
import { initQdrant, healthCheck } from "./config/qdrant";
import { validateConfig, PORT } from "./config/env";

async function startServer() {
  console.log("🔧 Starting RAG Pipeline Server...");
  
  // Validate configuration
  const configValidation = validateConfig();
  if (!configValidation.isValid) {
    console.error("❌ Configuration validation failed:");
    configValidation.errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
  console.log("✅ Configuration validated");

  // Initialize Qdrant
  try {
    await initQdrant();
    console.log("✅ Qdrant initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize Qdrant:", error);
    process.exit(1);
  }

  // Create Elysia app
  const app = new Elysia()
    .onError(({ code, error, set }) => {
      console.error(`❌ Server error [${code}]:`, error);
      
      if (code === 'VALIDATION') {
        set.status = 400;
        return {
          success: false,
          error: 'Validation failed',
          details: error.message,
          code: 'VALIDATION_ERROR'
        };
      }
      
      if (code === 'NOT_FOUND') {
        set.status = 404;
        return {
          success: false,
          error: 'Endpoint not found',
          code: 'NOT_FOUND'
        };
      }
      
      set.status = 500;
      return {
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      };
    })
    .get("/", () => ({
      message: "RAG Pipeline API",
      version: "1.0.0",
      status: "healthy",
      endpoints: {
        ingest: "POST /ingest",
        query: "POST /query",
        health: "GET /health",
        stats: "GET /query/stats"
      },
      timestamp: new Date().toISOString()
    }))
    .get("/health", async ({ set }) => {
      try {
        const qdrantHealthy = await healthCheck();
        
        if (!qdrantHealthy) {
          set.status = 503;
          return {
            status: "unhealthy",
            services: {
              api: "healthy",
              qdrant: "unhealthy"
            },
            timestamp: new Date().toISOString()
          };
        }
        
        return {
          status: "healthy",
          services: {
            api: "healthy",
            qdrant: "healthy"
          },
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        set.status = 503;
        return {
          status: "unhealthy",
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        };
      }
    })
    .use(ingestRoute())
    .use(queryRoute());

  // Start server
  app.listen(PORT);
  console.log(`🚀 RAG Pipeline server running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation:`);
  console.log(`  - Health: GET http://localhost:${PORT}/health`);
  console.log(`  - Stats: GET http://localhost:${PORT}/query/stats`);
  console.log(`  - Ingest: POST http://localhost:${PORT}/ingest`);
  console.log(`  - Query: POST http://localhost:${PORT}/query`);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down gracefully...');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down gracefully...');
    process.exit(0);
  });
}

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
