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
1. MVP acknowledgment FIRST (if applicable): For ANY question mentioning specific practitioners, locations, gender preferences, or directories, START the response with: "We're in development and can't offer specific practitioner recommendations just yet. The chatbot will be able to help you find which type of professional is best for you, how to access them, and how much you can get back from Medicare."

2. Empathy opener: "It's completely normal to feel uncertain about who to see—there are several options and they each work a bit differently."

3. Direct: who typically helps with this issue

4. Professional descriptions with training/education:
   - Psychologist (Clinical): 6+ years university training including supervised clinical placements. Specializes in mental health disorders, therapy, and psychological assessment. Medicare rebate $145.25 with Mental Health Treatment Plan.
   - Psychologist (General): 4+ years university psychology training. Provides counselling and therapy but less specialized in severe mental health conditions. Medicare rebate $98.95 with Mental Health Treatment Plan.
   - Counsellor: Varies from certificate to master's level training. Focuses on talk therapy and support. No Medicare rebates (private fees $80-150).
   - Psychiatrist: Medical doctor (8+ years) specializing in mental health. Can prescribe medication. Medicare rebates available.
   - GP: Medical doctor who can provide initial mental health support, referrals, and prescribe basic medications. Bulk-billed or small gap fees.

5. Costs/rebates: Mental Health Treatment Plan from GP provides 10 subsidized sessions per year

6. Fit matters: rapport and experience with your specific concerns often matter more than credentials alone

7. Next steps: 2–3 clear actions

8. Offer help to go deeper

FOR ALL QUESTIONS:
9. Safety: if user signals crisis or risk, redirect to crisis supports immediately
10. Keep responses helpful, practical, and focused on navigation (not clinical advice)

FORMATTING RULES:
- Use double line breaks between major sections
- Use double line breaks between each numbered item in lists
- Short paragraphs within sections, plain English, no markdown formatting
- Keep numbers concrete, then mention potential gap fees unless bulk-billed
- Avoid jargon; if you must use a term, give a 1‑line explanation

EXAMPLE TARGET RESPONSE:
For "I'm not sure who to see about anxiety and relationship issues":

"It's completely normal to feel uncertain about who to see—there are several options and they each work a bit differently.

For anxiety and relationship concerns, people usually see a psychologist or a counsellor.

[Professional descriptions with training details]

The right person depends on your specific needs and budget, but rapport matters a lot—you want someone you feel comfortable opening up to.

Your next steps: Get a Mental Health Treatment Plan from your GP for Medicare rebates, then search Psychology Today or call a few practitioners to ask about their experience with anxiety and relationships.

Is there anything specific about the process or costs you'd like me to explain further?"

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
