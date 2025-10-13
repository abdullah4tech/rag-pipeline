#!/usr/bin/env bun
import axios from "axios";

// Simple test to verify Gemini API key works
async function testGeminiAPI() {
  console.log("🧪 Testing Gemini API connection...");
  
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY not found in environment variables");
    console.log("💡 Please set GEMINI_API_KEY in your .env file");
    return;
  }

  console.log(`🔑 Using API key: ${apiKey.substring(0, 10)}...${apiKey.slice(-4)}`);

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${apiKey}`;
    
    const response = await axios.post(apiUrl, {
      model: "models/embedding-001",
      content: {
        parts: [{ text: "Hello, world!" }]
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    console.log("✅ API test successful!");
    console.log("Response status:", response.status);
    console.log("Embedding dimension:", response.data.embedding.values.length);
    console.log("First few values:", response.data.embedding.values.slice(0, 5));
    
  } catch (error) {
    console.error("❌ API test failed:");
    
    if (axios.isAxiosError(error)) {
      console.error("Status:", error.response?.status);
      console.error("Status text:", error.response?.statusText);
      console.error("Error data:", JSON.stringify(error.response?.data, null, 2));
      
      if (error.response?.status === 400) {
        console.log("\n💡 Common causes of 400 errors:");
        console.log("  - Invalid API key format");
        console.log("  - API key doesn't have required permissions");
        console.log("  - Request format is incorrect");
      } else if (error.response?.status === 403) {
        console.log("\n💡 403 Forbidden - Check your API key permissions");
      } else if (error.response?.status === 401) {
        console.log("\n💡 401 Unauthorized - Your API key might be invalid");
      }
    } else {
      console.error("Error:", error instanceof Error ? error.message : String(error));
    }
  }
}

// Run the test
testGeminiAPI();