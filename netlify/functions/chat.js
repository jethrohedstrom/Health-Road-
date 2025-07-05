// netlify/functions/chat.js
const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');

// Environment variables (set these in Netlify dashboard)
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const INDEX_NAME = 'health-road-knowledge';

// Initialize clients
const pinecone = new Pinecone({
  apiKey: PINECONE_API_KEY,
  environment: PINECONE_ENVIRONMENT
});
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { message } = JSON.parse(event.body);
    if (!message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message is required' })
      };
    }

    // Step 1: Create embedding from user message
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: message
    });
    const embedding = embeddingResponse.data[0]?.embedding;

    if (!embedding) {
      throw new Error('Failed to generate embedding');
    }

    // Step 2: Query Pinecone for top 3 relevant documents
    const index = pinecone.index(INDEX_NAME);
    const searchResults = await index.query({
      vector: embedding,
      topK: 3,
      includeMetadata: true
    });

    const context = (searchResults.matches || [])
      .map(m => m.metadata?.content || '')
      .join('\n\n')
      .slice(0, 3000); // Safety trim

    const systemPrompt = `You are a helpful assistant for Health Road, a website that helps Australians navigate mental health services.

Use the following context to answer questions about services, costs, and access. Be clear when you're answering from known info versus general guidance.

Context:
${context}

Important: Prioritize context-based answers. If the context is unclear, respond cautiously and offer guidance or clarification.`;

    // Step 3: Generate response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const response = completion.choices?.[0]?.message?.content || 'Sorry, something went wrong.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response,
        debug: {
          contextLength: context.length,
          matchedDocs: searchResults.matches?.length || 0
        }
      })
    };

  } catch (error) {
    console.error('Chat function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        details: error.message
      })
    };
  }
};
