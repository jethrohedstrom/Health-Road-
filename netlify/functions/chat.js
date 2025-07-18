const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT;
const PINECONE_PROJECT_ID = process.env.PINECONE_PROJECT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const INDEX_NAME = 'health-road-knowledge';

const pinecone = new Pinecone({ 
  apiKey: PINECONE_API_KEY,
  environment: PINECONE_ENVIRONMENT,
  projectId: PINECONE_PROJECT_ID
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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

    console.log('User question:', message);

    const questionEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: message,
    });

    console.log('Created embedding for question');

    const index = pinecone.index(INDEX_NAME);
    const searchResults = await index.query({
      vector: questionEmbedding.data[0].embedding,
      topK: 3,
      includeMetadata: true
    });

    console.log(`Found ${searchResults.matches.length} relevant documents`);

    let context = '';
    if (searchResults.matches && searchResults.matches.length > 0) {
      context = searchResults.matches
        .map(match => match.metadata.content)
        .join('\n\n');
    }

    const systemPrompt = `You are a helpful assistant for Health Road, a website that helps Australians navigate mental health services. 

Use the following context to answer questions about mental health services, costs, and access in Australia. If the context contains relevant information, use it to provide accurate answers. If the context doesn't contain relevant information, you can provide general helpful guidance but make it clear when you're going beyond the specific knowledge base.

Context:
${context}

Important: Always prioritize information from the context above when it's relevant to the user's question.`;

    const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
      
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
