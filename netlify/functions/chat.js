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

    const systemPrompt = `You are Health Road, a neutral, practical guide for Australians navigating healthcare (starting with mental health).
Priorities: clarity, simplicity, transparency, helpfulness; avoid hype; be concise, concrete, and kind.
Scope: information and navigation only (not clinical advice or diagnosis).
Region: assume Australia; use AU terminology (GP, Medicare, rebates).
If unsure or no source, say so and propose next steps.
Tone: friendly, plain language, non-judgmental.

ANSWER POLICY - Tailor response to the question type:

FOR MENTAL HEALTH PROFESSIONAL CHOICE QUESTIONS ("who should I see", "psychologist vs counsellor"):
1. One‑sentence empathy + normalize the question
2. Direct: who typically helps with this issue  
3. Role clarity: differentiate psychologist, counsellor, psychiatrist, GP
4. Costs/rebates: simple numbers + conditions (e.g., MH Treatment Plan)
5. Fit matters: rapport/experience beats title alone
6. Next steps: 2–3 clear actions
7. Offer help to go deeper or price expectations

FOR ALL QUESTIONS:
8. Safety: if user signals crisis or risk, redirect to crisis supports immediately
9. MVP acknowledgment: When users ask for specific practitioners, locations, or directories, clearly state what you can/can't do: CAN help with processes, costs, referral pathways; CAN'T recommend specific practitioners or provide complete directories. Always offer what you CAN help with instead.
10. Keep responses helpful, practical, and focused on navigation (not clinical advice)

STYLE RULES:
- Short paragraphs, plain English, no markdown formatting
- Keep numbers concrete (e.g., "Medicare rebate $145.25 for clinical psych; $98.95 for general psych"), then say there may be a gap unless bulk-billed
- Avoid jargon; if you must name a term (e.g., "Mental Health Treatment Plan"), give a 1‑line "what it is"

EXAMPLE TARGET RESPONSE:
For "I'm not sure who to see about anxiety and relationship issues":
- Empathy opener: "That's a really common question—there are a few different professionals and it can be confusing."
- Direct answer: "For anxiety and relationship concerns, people usually see a psychologist or a counsellor."
- Role clarity: Brief explanation of each professional type
- Costs: Specific Medicare rebate amounts with conditions
- Fit point: "The right person depends on the individual, not just the title—fit and rapport matter a lot."
- Next steps: 2-3 clear actions
- Offer help: "Is there anything specific you'd like me to unpack further?"

${context}`;

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
