# RAG Pipeline API Documentation

A production-ready RAG (Retrieval-Augmented Generation) pipeline with PDF ingestion and AI-powered querying capabilities.

## Base URL
```
http://localhost:5000
```

## Authentication
This API currently doesn't require authentication for endpoints, but uses Google Gemini API key for AI services.

## Response Format
All API responses follow a consistent structure:

### Success Response
```json
{
  "success": true,
  // ... endpoint-specific data
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE"
}
```

---

## Endpoints

### 1. Health Check

Check the overall health of the API and its dependencies.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "api": "healthy",
    "qdrant": "healthy"
  },
  "timestamp": "2025-10-15T12:00:00.000Z"
}
```

**Status Codes:**
- `200` - All services are healthy
- `503` - One or more services are unhealthy

---

### 2. API Information

Get basic API information and available endpoints.

**Endpoint:** `GET /`

**Response:**
```json
{
  "message": "RAG Pipeline API",
  "version": "1.0.0",
  "status": "healthy",
  "endpoints": {
    "ingest": "POST /ingest",
    "query": "POST /query",
    "health": "GET /health",
    "stats": "GET /query/stats"
  },
  "timestamp": "2025-10-15T12:00:00.000Z"
}
```

---

### 3. Document Ingestion

Ingest a PDF document into the RAG pipeline for later querying.

**Endpoint:** `POST /ingest`

**Request Body:**
```json
{
  "doc_id": "unique-document-identifier",
  "pdf_base64": "base64-encoded-pdf-content",
  "overwrite": false,
  "chunk_size": 1000,
  "chunk_overlap": 200
}
```

**Parameters:**
- `doc_id` (required): Unique identifier for the document (1-200 characters)
- `pdf_base64` (required): Base64-encoded PDF file content
- `overwrite` (optional): Whether to overwrite existing document with same ID (default: false)
- `chunk_size` (optional): Size of text chunks (100-2000 characters, default: varies by service)
- `chunk_overlap` (optional): Overlap between chunks (0-500 characters, default: varies by service)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Successfully ingested document with 15 chunks from 5 pages",
  "doc_id": "unique-document-identifier",
  "total_chunks": 15,
  "total_pages": 5,
  "processing_time_ms": 2340
}
```

**Error Responses:**
- `400` - Invalid input (empty doc_id, invalid base64, etc.)
- `413` - PDF file too large (max 50MB)
- `500` - Internal processing error

**Error Codes:**
- `INVALID_DOC_ID` - Document ID is empty or invalid
- `INVALID_PDF_DATA` - PDF data is empty
- `INVALID_BASE64` - Invalid base64 format
- `DECODE_ERROR` - Cannot decode base64 data
- `FILE_TOO_LARGE` - PDF exceeds size limit
- `EMPTY_PDF` - No text content found in PDF
- `NO_CHUNKS` - No chunks generated from content
- `EMBEDDING_ERROR` - Failed to generate embeddings
- `INGESTION_ERROR` - General ingestion failure

---

### 4. Query Documents

Query the ingested documents using natural language.

**Endpoint:** `POST /query`

**Request Body:**
```json
{
  "question": "What is the main topic of the document?",
  "top_k": 8,
  "doc_id": "specific-document-id",
  "min_score": 0.7
}
```

**Parameters:**
- `question` (required): The question to ask (1-1000 characters)
- `top_k` (optional): Number of most relevant chunks to retrieve (1-50, default: 8)
- `doc_id` (optional): Filter results to specific document ID
- `min_score` (optional): Minimum relevance score threshold (0-1, default: 0.0)

**Success Response (200):**
```json
{
  "success": true,
  "answer": {
    "text": "Based on the provided documents, the main topic is...",
    "sources": [
      {
        "doc_id": "document-1",
        "page": 1,
        "chunk_id": "chunk-1-1",
        "text": "Relevant text snippet...",
        "score": 0.95
      }
    ],
    "confidence": 0.8
  },
  "query_time_ms": 1250,
  "total_results": 5
}
```

**Response Fields:**
- `answer.text`: Generated answer text
- `answer.sources`: Array of source chunks used to generate the answer
- `answer.confidence`: Confidence score of the generated answer (0-1)
- `query_time_ms`: Total processing time in milliseconds
- `total_results`: Number of relevant chunks found

**Error Responses:**
- `400` - Invalid input parameters
- `500` - Internal processing error

**Error Codes:**
- `INVALID_QUESTION` - Question is empty
- `QUESTION_TOO_LONG` - Question exceeds character limit
- `INVALID_TOP_K` - top_k parameter out of range
- `INVALID_MIN_SCORE` - min_score parameter out of range
- `EMBEDDING_ERROR` - Failed to generate query embedding
- `QUERY_ERROR` - General query processing error

---

### 5. Collection Statistics

Get statistics about the vector collection.

**Endpoint:** `GET /query/stats`

**Response:**
```json
{
  "success": true,
  "collection_stats": {
    "vectors_count": 1250,
    "indexed_vectors_count": 1250,
    "points_count": 1250,
    "segments_count": 1,
    "disk_data_size": 15728640,
    "ram_data_size": 8388608,
    "config": {
      "params": {
        "vectors": {
          "size": 3072,
          "distance": "Cosine"
        }
      }
    }
  },
  "timestamp": "2025-10-15T12:00:00.000Z"
}
```

---

### 6. Test Interface

Access the built-in test interface for manual API testing.

**Endpoint:** `GET /test`

Returns an HTML test interface for manually testing the API endpoints.

---

## Frontend Integration Examples

### JavaScript/TypeScript

#### Ingesting a Document
```javascript
async function ingestDocument(docId, pdfFile) {
  // Convert file to base64
  const base64 = await fileToBase64(pdfFile);
  
  const response = await fetch('http://localhost:5000/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      doc_id: docId,
      pdf_base64: base64,
      overwrite: true,
      chunk_size: 1000,
      chunk_overlap: 200
    })
  });
  
  const result = await response.json();
  return result;
}

// Helper function to convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]; // Remove data:application/pdf;base64,
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}
```

#### Querying Documents
```javascript
async function queryDocuments(question, options = {}) {
  const response = await fetch('http://localhost:5000/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question,
      top_k: options.topK || 8,
      doc_id: options.docId,
      min_score: options.minScore || 0.0
    })
  });
  
  const result = await response.json();
  return result;
}
```

#### Health Check
```javascript
async function checkHealth() {
  const response = await fetch('http://localhost:5000/health');
  const health = await response.json();
  return health;
}
```

### React Example Component

```jsx
import React, { useState } from 'react';

function RagPipelineDemo() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);

  const handleFileUpload = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setLoading(true);
    
    try {
      const result = await ingestDocument(selectedFile.name, selectedFile);
      if (result.success) {
        alert(`Document uploaded successfully! ${result.total_chunks} chunks created.`);
      } else {
        alert(`Upload failed: ${result.error}`);
      }
    } catch (error) {
      alert(`Upload error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleQuery = async () => {
    if (!question.trim()) return;
    
    setLoading(true);
    try {
      const result = await queryDocuments(question);
      setAnswer(result);
    } catch (error) {
      console.error('Query error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rag-demo">
      <h2>RAG Pipeline Demo</h2>
      
      <div className="upload-section">
        <h3>Upload PDF</h3>
        <input 
          type="file" 
          accept=".pdf"
          onChange={handleFileUpload}
          disabled={loading}
        />
      </div>

      <div className="query-section">
        <h3>Ask a Question</h3>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Enter your question..."
          disabled={loading}
        />
        <button onClick={handleQuery} disabled={loading || !question.trim()}>
          {loading ? 'Processing...' : 'Ask'}
        </button>
      </div>

      {answer && (
        <div className="answer-section">
          <h3>Answer</h3>
          <p>{answer.answer.text}</p>
          
          <h4>Sources</h4>
          {answer.answer.sources.map((source, index) => (
            <div key={index} className="source">
              <strong>Document:</strong> {source.doc_id}<br/>
              <strong>Page:</strong> {source.page}<br/>
              <strong>Score:</strong> {source.score.toFixed(3)}<br/>
              <strong>Text:</strong> {source.text}
            </div>
          ))}
          
          <p><small>Query time: {answer.query_time_ms}ms</small></p>
        </div>
      )}
    </div>
  );
}
```

### Python Example

```python
import requests
import base64
import json

class RagPipelineClient:
    def __init__(self, base_url="http://localhost:5000"):
        self.base_url = base_url
    
    def ingest_document(self, doc_id, pdf_path, overwrite=False):
        """Ingest a PDF document"""
        with open(pdf_path, 'rb') as f:
            pdf_base64 = base64.b64encode(f.read()).decode()
        
        response = requests.post(f"{self.base_url}/ingest", json={
            "doc_id": doc_id,
            "pdf_base64": pdf_base64,
            "overwrite": overwrite
        })
        
        return response.json()
    
    def query_documents(self, question, top_k=8, doc_id=None, min_score=0.0):
        """Query the documents"""
        payload = {
            "question": question,
            "top_k": top_k,
            "min_score": min_score
        }
        
        if doc_id:
            payload["doc_id"] = doc_id
            
        response = requests.post(f"{self.base_url}/query", json=payload)
        return response.json()
    
    def get_health(self):
        """Check API health"""
        response = requests.get(f"{self.base_url}/health")
        return response.json()
    
    def get_stats(self):
        """Get collection statistics"""
        response = requests.get(f"{self.base_url}/query/stats")
        return response.json()

# Usage example
if __name__ == "__main__":
    client = RagPipelineClient()
    
    # Check health
    health = client.get_health()
    print("Health:", health)
    
    # Ingest document
    result = client.ingest_document("my-doc", "path/to/document.pdf")
    print("Ingestion result:", result)
    
    # Query
    answer = client.query_documents("What is this document about?")
    print("Answer:", answer["answer"]["text"])
```

## Environment Variables

Make sure these environment variables are set:

```bash
# Required
GEMINI_API_KEY=your-google-gemini-api-key

# Optional (with defaults)
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=pdf_vectors
VECTOR_SIZE=3072
PORT=5000
```

## Error Handling Best Practices

1. **Always check the `success` field** in responses
2. **Handle different HTTP status codes** appropriately
3. **Use the `code` field** for programmatic error handling
4. **Display user-friendly messages** based on error codes
5. **Implement retry logic** for transient failures
6. **Validate input** on the frontend before sending requests

## Rate Limiting and Performance

- The API doesn't currently implement rate limiting
- Large PDF files (>50MB) are rejected
- Embedding generation may take several seconds for large documents
- Consider implementing loading states in your frontend
- Monitor the `processing_time_ms` and `query_time_ms` fields for performance insights

## CORS Support

The API includes CORS support for cross-origin requests from web applications.