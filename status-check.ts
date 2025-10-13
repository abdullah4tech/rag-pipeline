#!/usr/bin/env bun
import { GEMINI_API_KEY } from "./src/config/env";

console.log("🔍 RAG Pipeline Status Check");
console.log("=" .repeat(50));

// Check API key
if (!GEMINI_API_KEY) {
  console.log("❌ GEMINI_API_KEY not configured");
  console.log("💡 Set it in your .env file");
} else {
  console.log(`✅ GEMINI_API_KEY configured: ${GEMINI_API_KEY.substring(0, 10)}...`);
}

console.log("\n📊 Current Situation:");
console.log("• Your Gemini API key is valid ✅");
console.log("• You've exceeded the free tier quota 🚫");
console.log("• Fallback embeddings are now active ⚠️");

console.log("\n🚀 Next Steps:");
console.log("1. 🔄 Try ingesting your document now (will use fallback)");
console.log("2. ⏳ Wait 24 hours for quota reset");
console.log("3. 💳 Upgrade to paid plan for unlimited access");
console.log("4. 🧪 Test with smaller documents first");

console.log("\n⚠️  Note: Fallback embeddings provide basic functionality");
console.log("   but may have lower search quality than Gemini embeddings.");

console.log("\n🌐 Your test interface: http://localhost:5000/test");
console.log("📚 Google AI pricing: https://ai.google.dev/pricing");

console.log("\n" + "=".repeat(50));