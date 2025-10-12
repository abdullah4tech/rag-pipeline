# RAG Pipeline API

A production-ready Retrieval-Augmented Generation (RAG) pipeline built with Elysia, Bun, and TypeScript. This system allows you to ingest PDF documents, convert them to vector embeddings, and query them using natural language.

## 🚀 Features

- **PDF Document Ingestion**: Upload PDF documents via base64 encoding
- **Smart Text Chunking**: Intelligent text chunking with overlap for better context
- **Vector Embeddings**: Generate embeddings using Google's Gemini API
- **Vector Search**: Fast similarity search using Qdrant vector database
- **AI-Powered Answers**: Generate contextual answers using Gemini AI
- **Error Handling**: Comprehensive error handling and validation
- **Health Monitoring**: Health checks and system monitoring endpoints
- **Type Safety**: Full TypeScript support with proper type definitions

## 🛠️ Tech Stack

- **Runtime**: Bun
- **Framework**: Elysia
- **Language**: TypeScript
- **Vector Database**: Qdrant
- **AI Model**: Google Gemini
- **PDF Processing**: pdf-parse

## 📋 Prerequisites

- [Bun](https://bun.sh/) installed
- [Qdrant](https://qdrant.tech/) running (local or cloud)
- Google Gemini API key

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd rag-pipeline
bun install
```

### 2. Environment Setup

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Required: Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_EMBED_URL=https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent
GEMINI_GEN_URL=https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent

# Qdrant Configuration
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=pdf_vectors
VECTOR_SIZE=768

# Server Configuration
PORT=5000
```

### 3. Start Qdrant

Using Docker:
```bash
docker run -p 6333:6333 qdrant/qdrant
```

### 4. Run the Server

```bash
bun run dev
```

The server will start at `http://localhost:5000`

## 📚 API Endpoints

### Health Check
```http
GET /health
```

### Document Ingestion
```http
POST /ingest
Content-Type: application/json

{
  "doc_id": "document-1",
  "pdf_base64": "base64-encoded-pdf-content",
  "overwrite": false,
  "chunk_size": 800,
  "chunk_overlap": 100
}
```

### Query Documents
```http
POST /query
Content-Type: application/json

{
  "question": "What is the main topic of the document?",
  "top_k": 5,
  "doc_id": "document-1",
  "min_score": 0.7
}
```

### Collection Statistics
```http
GET /query/stats
```

## 🔧 Configuration Options

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | - | ✅ |
| `GEMINI_EMBED_URL` | Gemini embeddings endpoint | - | ✅ |
| `GEMINI_GEN_URL` | Gemini generation endpoint | - | ✅ |
| `QDRANT_URL` | Qdrant server URL | `http://localhost:6333` | ✅ |
| `QDRANT_API_KEY` | Qdrant API key (if auth enabled) | - | ❌ |
| `COLLECTION_NAME` | Vector collection name | `pdf_vectors` | ❌ |
| `VECTOR_SIZE` | Embedding vector dimensions | `768` | ❌ |
| `PORT` | Server port | `5000` | ❌ |

## 🏗️ Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Client    │───▶│  RAG API     │───▶│   Qdrant    │
└─────────────┘    └──────────────┘    └─────────────┘
                           │
                           ▼
                   ┌──────────────┐
                   │  Gemini AI   │
                   └──────────────┘
```

### Data Flow

1. **Ingestion**: PDF → Text Extraction → Chunking → Embeddings → Vector Storage
2. **Query**: Question → Embedding → Vector Search → Context Retrieval → AI Generation

## 🧪 Example Usage

### Ingest a Document

```bash
curl -X POST http://localhost:5000/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "doc_id": "research-paper-1",
    "pdf_base64": "'$(base64 -i document.pdf)'"
  }'
```

### Query the Document

```bash
curl -X POST http://localhost:5000/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the main findings?",
    "top_k": 3
  }'
```

## 🐛 Troubleshooting

### Common Issues

1. **Qdrant Connection Failed**
   - Ensure Qdrant is running on the specified URL
   - Check firewall settings

2. **Gemini API Errors**
   - Verify API key is correct
   - Check API endpoint URLs
   - Ensure you have sufficient API quota

3. **PDF Processing Errors**
   - Ensure PDF is valid and not password-protected
   - Check base64 encoding is correct

4. **Memory Issues**
   - Large PDFs may require more memory
   - Consider adjusting chunk sizes

## 🚀 Deployment

### Docker Deployment

```dockerfile
FROM oven/bun:1 as base
WORKDIR /usr/src/app

# Copy package files
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Start the application
CMD ["bun", "run", "src/index.ts"]
```

### Environment Variables for Production

- Set `NODE_ENV=production`
- Use secure CORS settings
- Configure proper logging
- Set up monitoring and alerting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- Create an issue for bug reports
- Check existing issues before creating new ones
- Provide detailed information about your environment