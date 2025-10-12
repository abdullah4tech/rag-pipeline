// Environment configuration with validation
function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue || "";
  if (!value && !defaultValue) {
    console.warn(`Warning: Environment variable ${name} is not set`);
  }
  return value;
}

export const GEMINI_EMBED_URL = getEnvVar("GEMINI_EMBED_URL");
export const GEMINI_GEN_URL = getEnvVar("GEMINI_GEN_URL");
export const GEMINI_API_KEY = getEnvVar("GEMINI_API_KEY");
export const QDRANT_URL = getEnvVar("QDRANT_URL", "http://localhost:6333");
export const QDRANT_API_KEY = getEnvVar("QDRANT_API_KEY"); // Optional for auth
export const COLLECTION_NAME = getEnvVar("COLLECTION_NAME", "pdf_vectors");
export const VECTOR_SIZE = parseInt(getEnvVar("VECTOR_SIZE", "768")); // Default for many models
export const PORT = parseInt(getEnvVar("PORT", "5000"));

// Validation
export function validateConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!GEMINI_EMBED_URL) {
    errors.push("GEMINI_EMBED_URL is required");
  }
  
  if (!GEMINI_GEN_URL) {
    errors.push("GEMINI_GEN_URL is required");
  }
  
  if (!GEMINI_API_KEY) {
    errors.push("GEMINI_API_KEY is required");
  }
  
  if (!QDRANT_URL) {
    errors.push("QDRANT_URL is required");
  }
  
  if (isNaN(VECTOR_SIZE) || VECTOR_SIZE <= 0) {
    errors.push("VECTOR_SIZE must be a positive number");
  }
  
  if (isNaN(PORT) || PORT <= 0 || PORT > 65535) {
    errors.push("PORT must be a valid port number");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}