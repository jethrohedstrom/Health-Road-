// netlify/functions/chat.js - RAG-enabled chat function (SECURE VERSION)
const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');

// Configuration - using environment variables for security
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_ENVIRONMENT = 'us-east-1';
const INDEX_NAME = 'health-road-knowledge';

// Initialize clients
const pinecone = new Pinecone({ 
  apiKey: PINECONE_API_KEY,
  environment: PINECONE_ENVIRONMENT 
});
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
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

    console.log('User question:', message);

    // Step 1: Create embedding for the user's question
    const questionEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: message,
    });

    console.log('Created embedding for question');

    // Step 2: Search Pinecone for relevant knowledge
    const index = pinecone.index(INDEX_NAME);
    const searchResults = await index.query({
      vector: questionEmbedding.data[0].embedding,
      topK: 3, // Get top 3 most relevant chunks
      includeMetadata: true
    });

    console.log(`Found ${searchResults.matches.length} relevant documents`);

    // Step 3: Extract relevant context from search results
    let context = '';
    if (searchResults.matches && searchResults.matches.length > 0) {
      context = searchResults.matches
        .map(match => match.metadata.content)
        .join('\n\n');
    }

    // Step 4: Generate response using context + question
    const systemPrompt = `You are a helpful assistant for Health Road, a website that helps Australians navigate mental health services. 

Use the following context to answer questions about mental health services, costs, and access in Australia. If the context contains relevant information, use it to provide accurate answers. If the context doesn't contain relevant information, you can provide general helpful guidance but make it clear when you're going beyond the specific knowledge base.

Context:
${context}

Important: Always prioritize information from the context above when it's relevant to the user's question.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const response = completion.choices[0].message.content;

    console.log('Generated response:', response);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: response,
        debug: {
          contextFound: searchResults.matches.length > 0,
          relevantDocs: searchResults.matches.length
        }
      })
    };

  } catch (error) {
    console.error('Error in chat function:', error);
    
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
