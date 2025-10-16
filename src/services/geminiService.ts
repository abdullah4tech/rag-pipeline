import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY } from "../config/env";
import { SearchResult } from "./vectorService";

export interface GeneratedAnswer {
  text: string;
  sources: Array<{
    doc_id: string;
    page: number;
    relevanceScore: number;
  }>;
  confidence: number;
}

const MAX_CONTEXT_LENGTH = 8000; // Adjust based on model limits
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function handleSimpleGreetings(question: string): Promise<string | null> {
  const normalizedQuestion = question.toLowerCase().trim();
  
  // Simple greetings
  const greetingPatterns = [
    /^(hi|hello|hey|hiya|good morning|good afternoon|good evening)!?$/,
    /^(hi there|hello there|hey there)!?$/,
    /^(what's up|whats up|wassup)(\?)?$/,
    /^(how are you|how do you do)(\?)?$/,
    /^(good day|greetings)!?$/
  ];
  
  // Check if it's a simple greeting
  const isGreeting = greetingPatterns.some(pattern => pattern.test(normalizedQuestion));
  
  if (isGreeting) {
    // Generate response from LLM for more natural interaction
    return await generateGreetingResponse(question);
  }
  
  // Simple conversational queries that don't need document context
  const conversationalPatterns = [
    /^(who are you|what are you)(\?)?$/,
    /^(what do you do|what can you do)(\?)?$/,
    /^(help|can you help|can you help me)(\?)?$/,
    /^(thank you|thanks|thx)!?$/,
    /^(goodbye|bye|see you|farewell)!?$/
  ];
  
  const isConversational = conversationalPatterns.some(pattern => pattern.test(normalizedQuestion));
  
  if (isConversational) {
    if (normalizedQuestion.includes('who are you') || normalizedQuestion.includes('what are you')) {
      return "I'm an AI assistant that can help you find information from your documents. Just ask me any question!";
    } else if (normalizedQuestion.includes('what do you do') || normalizedQuestion.includes('what can you do')) {
      return "I can help you find information from your uploaded documents. Ask me questions about the content and I'll search through them to provide helpful answers.";
    } else if (normalizedQuestion.includes('help')) {
      return "I'm here to help! You can ask me questions about any documents you've uploaded, and I'll search through them to find relevant information for you.";
    } else if (normalizedQuestion.includes('thank') || normalizedQuestion.includes('thx')) {
      return "You're welcome! Feel free to ask me anything else.";
    } else if (normalizedQuestion.includes('bye') || normalizedQuestion.includes('goodbye') || normalizedQuestion.includes('farewell')) {
      return "Goodbye! Come back anytime if you have more questions.";
    }
  }
  
  return null; // Not a simple greeting or conversational query
}

async function generateGreetingResponse(greeting: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    // Fallback if no API key
    return "Hello! How can I help you today?";
  }

  try {
    const ai = new GoogleGenAI({});
    
    const prompt = `You are a friendly AI assistant. Respond naturally and warmly to this greeting: "${greeting}"

Keep your response:
- Brief and conversational
- Welcoming and helpful
- Under 20 words
- Don't mention documents or specific capabilities

Just give a natural, friendly response as if greeting someone in person.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        temperature: 0.7, // Higher temperature for more natural, varied greetings
      }
    });

    if (response.text && response.text.trim().length > 0) {
      return response.text.trim();
    }
  } catch (error) {
    console.warn('Failed to generate greeting response:', error);
  }

  // Fallback response
  return "Hello! How can I help you today?";
}

export async function generateAnswer(question: string, hits: SearchResult[]): Promise<GeneratedAnswer> {
  if (!question || question.trim().length === 0) {
    throw new Error("Question cannot be empty");
  }

  if (!GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key configuration");
  }

  // Handle simple greetings and conversational inputs
  const greetingResponse = await handleSimpleGreetings(question);
  if (greetingResponse) {
    return {
      text: greetingResponse,
      sources: [],
      confidence: 1.0
    };
  }

  if (!hits || hits.length === 0) {
    return {
      text: "I couldn't find relevant information to answer your question. Please try rephrasing your question or check if the document has been properly ingested.",
      sources: [],
      confidence: 0
    };
  }

  // Preprocess and enhance the question
  const enhancedQuestion = preprocessQuestion(question);
  console.log(`🔍 Enhanced question: "${enhancedQuestion}"`);
  
  // Log retrieval quality for debugging
  console.log(`📊 Retrieved ${hits.length} chunks with scores: [${hits.slice(0, 3).map(h => h.score.toFixed(3)).join(', ')}...]`);

  // Simple and effective relevance filtering for normal RAG pipeline
  const scores = hits.map(h => h.score);
  const maxScore = Math.max(...scores);
  
  // Straightforward threshold - use what we have if it's reasonable
  let relevanceThreshold = 0.3; // Low threshold to be inclusive
  
  // Only be more selective if we have really good matches
  if (maxScore > 0.75) {
    relevanceThreshold = 0.5; // Use better quality if available
  } else if (maxScore > 0.6) {
    relevanceThreshold = 0.4; // Moderate filtering
  }
  // Otherwise stick with 0.3 to ensure we provide responses
  
  console.log(`🎯 Using relevance threshold: ${relevanceThreshold.toFixed(3)} (maxScore: ${maxScore.toFixed(3)})`);
  
  const relevantHits = hits.filter(h => h.score >= relevanceThreshold);
  
  if (relevantHits.length === 0) {
    // Check if we have any decent matches at all
    const decentHits = hits.filter(h => h.score > 0.3);
    
    if (decentHits.length === 0) {
      return {
        text: "I couldn't find any relevant information in the available documents to answer your question. The document content may not cover this topic, or you might need to rephrase your question using different keywords.",
        sources: [],
        confidence: 0
      };
    }
    
    return {
      text: `I found some potentially related content, but it doesn't appear to directly address your specific question. The most relevant information I found has a low confidence match (${Math.round(maxScore * 100)}%). You might want to try rephrasing your question or asking about a more general topic covered in the documents.`,
      sources: decentHits.slice(0, 3).map(h => ({
        doc_id: h.payload.doc_id,
        page: h.payload.page,
        relevanceScore: h.score
      })),
      confidence: Math.min(0.4, maxScore)
    };
  }

  const context = buildContext(relevantHits);
  const prompt = buildPrompt(enhancedQuestion, context);

  try {
    const rawResponse = await generateWithRetry(prompt);
    const polishedResponse = postProcessResponse(rawResponse, relevantHits);
    const confidence = calculateConfidence(relevantHits);
    
    // If confidence is very low (< 0.35), be honest about not having good data
    if (confidence < 0.35) {
      return {
        text: `I don't have sufficient relevant information in the available documents to properly answer your question. The content I found doesn't closely match what you're asking about. Try rephrasing your question or asking about topics that are more directly covered in your documents.`,
        sources: [],
        confidence: 0
      };
    }
    
    console.log(`✨ Generated response with ${confidence.toFixed(2)} confidence using ${relevantHits.length} sources`);
    
    return {
      text: polishedResponse,
      sources: relevantHits.map((h) => ({
        doc_id: h.payload.doc_id,
        page: h.payload.page,
        relevanceScore: h.score,
      })),
      confidence
    };
  } catch (error) {
    console.error('❌ Gemini API failed:', error);
    throw error;
  }
}

function buildContext(hits: SearchResult[]): string {
  // Sort by relevance score (highest first) - use all relevant hits passed to this function
  const sortedHits = hits.sort((a, b) => b.score - a.score);
  
  let context = "";
  let currentLength = 0;
  const maxSources = 8; // Increased to provide more context for better answers
  
  // Group by document to avoid repetitive content
  const documentGroups = new Map<string, SearchResult[]>();
  sortedHits.forEach(hit => {
    const docKey = `${hit.payload.doc_id}_${hit.payload.page}`;
    if (!documentGroups.has(docKey)) {
      documentGroups.set(docKey, []);
    }
    documentGroups.get(docKey)!.push(hit);
  });
  
  // Process each document group
  let sourceCount = 0;
  for (const [docKey, docHits] of documentGroups) {
    if (sourceCount >= maxSources || currentLength >= MAX_CONTEXT_LENGTH) break;
    
    // Take the best hit from this document/page
    const bestHit = docHits[0];
    const relevancePercent = Math.round(bestHit.score * 100);
    
    // Clean and prepare the text
    const cleanText = cleanTextForContext(bestHit.payload.text);
    const docName = extractDocumentName(bestHit.payload.doc_id);
    
    const source = `[Source: ${docName}, Page ${bestHit.payload.page}, Relevance: ${relevancePercent}%]`;
    const content = `${source}\n${cleanText}\n---\n\n`;
    
    // Check if we have space for this content
    if (currentLength + content.length > MAX_CONTEXT_LENGTH) {
      const remaining = MAX_CONTEXT_LENGTH - currentLength;
      if (remaining > 200) { // Only add if there's meaningful space
        const truncatedText = cleanText.substring(0, remaining - source.length - 50);
        const lastSentence = truncatedText.lastIndexOf('.');
        const finalText = lastSentence > 0 ? truncatedText.substring(0, lastSentence + 1) : truncatedText;
        context += `${source}\n${finalText}...\n---\n\n`;
      }
      break;
    }
    
    context += content;
    currentLength += content.length;
    sourceCount++;
  }
  
  return context.trim();
}

function cleanTextForContext(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s.,!?;:()\-"']/g, '') // Remove special characters
    .trim()
    .substring(0, 1000); // Limit per chunk
}

function extractDocumentName(docId: string): string {
  // Extract meaningful document name from ID
  return docId
    .replace(/\d+$/, '') // Remove trailing numbers
    .replace(/[-_]/g, ' ') // Replace dashes/underscores with spaces
    .replace(/\.(pdf|doc|docx)$/i, '') // Remove file extensions
    .trim() || 'Document';
}

function buildPrompt(question: string, context: string): string {
  return `You are a helpful AI assistant. Answer the user's question based on the provided context information.

INSTRUCTIONS:
1. Answer directly and clearly based on the context provided
2. Use proper markdown formatting with correct line breaks
3. Be conversational and helpful
4. If the context doesn't fully answer the question, say what you can answer and note what's missing
5. Don't mention "the document" or "the context" - just provide the information naturally

FORMATTING EXAMPLE:
## Main Topic

Here's an introduction paragraph.

### Subtopic

- First bullet point
- Second bullet point
- Third bullet point

**Important note:** Key information here.

CONTEXT:
${context}

QUESTION: ${question}

ANSWER:`;
}

function calculateConfidence(hits: SearchResult[]): number {
  if (!hits || hits.length === 0) return 0;
  
  const scores = hits.map(h => h.score);
  const topScore = scores[0] || 0;
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  
  // Enhanced confidence calculation for 90%+ accuracy target
  let confidence = 0;
  
  // Factor 1: Top result quality - more weight for high accuracy (60% weight)
  confidence += topScore * 0.6;
  
  // Factor 2: Average quality of all results (25% weight)
  confidence += avgScore * 0.25;
  
  // Factor 3: High-quality source count bonus (15% weight)
  const highQualityCount = scores.filter(s => s > 0.8).length;
  const veryHighQualityCount = scores.filter(s => s > 0.9).length;
  
  let qualityBonus = 0;
  if (veryHighQualityCount > 0) {
    qualityBonus = Math.min(0.15, veryHighQualityCount * 0.05);
  } else if (highQualityCount > 0) {
    qualityBonus = Math.min(0.1, highQualityCount * 0.03);
  }
  confidence += qualityBonus;
  
  // Penalize low scores more aggressively for accuracy
  const lowQualityCount = scores.filter(s => s < 0.7).length;
  const lowQualityPenalty = lowQualityCount * 0.05;
  confidence -= lowQualityPenalty;
  
  // Bonus for score consistency (tight clustering indicates high relevance)
  const scoreStdDev = calculateStandardDeviation(scores);
  const consistencyBonus = scoreStdDev < 0.08 ? 0.05 : 0;
  confidence += consistencyBonus;
  
  // Ensure we meet 90% accuracy standard - be more conservative
  confidence = confidence * 0.9; // Apply accuracy factor
  
  // Cap with higher minimum for quality responses
  return Math.max(0.2, Math.min(0.95, confidence));
}

function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(val => Math.pow(val - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  
  return Math.sqrt(avgSquareDiff);
}

function preprocessQuestion(question: string): string {
  let enhanced = question.trim();
  
  // Normalize question format
  if (!enhanced.endsWith('?')) {
    enhanced += '?';
  }
  
  // Expand common abbreviations and improve clarity
  const expansions = {
    'whats': 'what is',
    'hows': 'how is',
    'wheres': 'where is',
    'whos': 'who is',
    'cant': 'cannot',
    'dont': 'do not',
    'wont': 'will not',
    'isnt': 'is not',
    'arent': 'are not'
  };
  
  for (const [abbrev, expansion] of Object.entries(expansions)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    enhanced = enhanced.replace(regex, expansion);
  }
  
  // Add context cues for better matching
  if (enhanced.toLowerCase().includes('how to') || enhanced.toLowerCase().includes('how do')) {
    enhanced = `Step-by-step process: ${enhanced}`;
  } else if (enhanced.toLowerCase().includes('what is') || enhanced.toLowerCase().includes('define')) {
    enhanced = `Definition and explanation: ${enhanced}`;
  } else if (enhanced.toLowerCase().includes('why') || enhanced.toLowerCase().includes('reason')) {
    enhanced = `Reasoning and explanation: ${enhanced}`;
  }
  
  return enhanced;
}

function postProcessResponse(response: string, sources: SearchResult[]): string {
  let polished = response.trim();
  
  // Remove any source citations that might have been included
  polished = polished.replace(/\[Source:[^\]]+\]/g, '');
  
  // Remove document/page references
  polished = polished.replace(/\(Page \d+[^)]*\)/g, '');
  polished = polished.replace(/\(Relevance: \d+%\)/g, '');
  
  // Remove any AI disclaimers or meta-commentary
  polished = polished.replace(/^(As an AI|I'm an AI|Based on the provided context|According to the context|From the document|The document states)/i, '');
  
  // Remove formal document language
  polished = polished.replace(/According to the (document|context|source|information provided)/gi, '');
  polished = polished.replace(/The document (mentions|states|indicates|shows)/gi, '');
  polished = polished.replace(/As mentioned in the (document|context|source)/gi, '');
  
  // FIX MARKDOWN FORMATTING - preserve line breaks and structure
  polished = polished
    .replace(/\n{3,}/g, '\n\n') // Fix excessive line breaks
    // DON'T normalize all spaces - preserve markdown structure
    .replace(/[ \t]+/g, ' ') // Only normalize horizontal whitespace, keep line breaks
    .trim();
  
  // Add confidence qualifier if the response seems uncertain
  const uncertaintyPhrases = ['might', 'could', 'possibly', 'perhaps', 'may be'];
  const hasUncertainty = uncertaintyPhrases.some(phrase => 
    polished.toLowerCase().includes(phrase)
  );
  
  // If response is uncertain and we have low-quality sources, add disclaimer
  const avgScore = sources.reduce((sum, s) => sum + s.score, 0) / sources.length;
  if (hasUncertainty && avgScore < 0.7) {
    polished += '\n\n*Note: This response is based on limited matching content. Consider rephrasing your question for more accurate results.*';
  }
  
  // Ensure response ends properly
  if (!polished.endsWith('.') && !polished.endsWith('!') && !polished.endsWith('?')) {
    polished += '.';
  }
  
  return polished;
}

async function generateWithRetry(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const ai = new GoogleGenAI({});

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
        config: {
          temperature: 0.1, // Lower temperature for higher accuracy and consistency
        }
      });

      if (!response.text || response.text.trim().length === 0) {
        throw new Error("Empty response from Gemini API");
      }

      return response.text.trim();

    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      
      console.error(`❌ Gemini generation attempt ${attempt}/${MAX_RETRIES} failed:`, error);
      
      // Don't retry on certain errors
      if (error instanceof Error) {
        if (error.message.includes('API_KEY') || error.message.includes('permission')) {
          throw error;
        }
      }
      
      if (isLastAttempt) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate response after ${MAX_RETRIES} attempts: ${errorMessage}`);
      }
      
      console.warn(`⏳ Generation attempt ${attempt} failed, retrying in ${RETRY_DELAY * attempt}ms...`);
      await sleep(RETRY_DELAY * attempt);
    }
  }
  
  throw new Error('Max retries exceeded');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
