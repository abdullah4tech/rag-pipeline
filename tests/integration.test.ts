import { expect, test, describe } from "bun:test";

// Simple integration tests for the RAG pipeline
describe("RAG Pipeline", () => {
  const baseUrl = "http://localhost:5000";
  
  test("health check should return healthy status", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.status).toBe("healthy");
  });

  test("root endpoint should return API info", async () => {
    const response = await fetch(`${baseUrl}/`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.message).toBe("RAG Pipeline API");
    expect(data.version).toBe("1.0.0");
  });

  test("ingest endpoint should validate required fields", async () => {
    const response = await fetch(`${baseUrl}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}) // Empty body
    });
    
    expect(response.status).toBe(400);
  });

  test("query endpoint should validate required fields", async () => {
    const response = await fetch(`${baseUrl}/query`, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}) // Empty body
    });
    
    expect(response.status).toBe(400);
  });
});

// You can add more comprehensive tests here
// Example: Test with actual PDF ingestion and querying