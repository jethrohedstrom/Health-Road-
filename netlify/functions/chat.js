const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT;
const PINECONE_PROJECT_ID = process.env.PINECONE_PROJECT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const INDEX_NAME = 'health-road-knowledge';

// Log environment variables for debugging
console.log('🔄 Environment variables check:');
console.log('- PINECONE_API_KEY:', PINECONE_API_KEY ? 'EXISTS' : 'MISSING');
console.log('- PINECONE_ENVIRONMENT:', PINECONE_ENVIRONMENT ? `EXISTS (${PINECONE_ENVIRONMENT})` : 'MISSING');
console.log('- PINECONE_PROJECT_ID:', PINECONE_PROJECT_ID ? `EXISTS (${PINECONE_PROJECT_ID})` : 'MISSING');
console.log('- OPENAI_API_KEY:', OPENAI_API_KEY ? 'EXISTS' : 'MISSING');

if (!PINECONE_API_KEY || !PINECONE_ENVIRONMENT || !OPENAI_API_KEY) {
  throw new Error(`Missing required environment variables: ${!PINECONE_API_KEY ? 'PINECONE_API_KEY ' : ''}${!PINECONE_ENVIRONMENT ? 'PINECONE_ENVIRONMENT ' : ''}${!OPENAI_API_KEY ? 'OPENAI_API_KEY' : ''}`);
}

console.log('🔄 Initializing Pinecone with config:', {
  apiKey: PINECONE_API_KEY ? '[PRESENT]' : '[MISSING]',
  environment: PINECONE_ENVIRONMENT,
  projectId: PINECONE_PROJECT_ID
});

const pineconeConfig = { 
  apiKey: PINECONE_API_KEY,
  environment: PINECONE_ENVIRONMENT,
  projectId: PINECONE_PROJECT_ID
};

console.log('🔄 Final Pinecone config:', JSON.stringify(pineconeConfig, (key, value) => 
  key === 'apiKey' ? '[REDACTED]' : value
));

console.log('🔄 About to create Pinecone client...');

const pinecone = new Pinecone(pineconeConfig);

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
    console.log('=== CHAT FUNCTION START ===');
    console.log('🔄 Environment check:');
    console.log('- OPENAI_API_KEY exists:', !!OPENAI_API_KEY);
    console.log('- PINECONE_API_KEY exists:', !!PINECONE_API_KEY);
    console.log('- INDEX_NAME:', INDEX_NAME);
    
    const { message } = JSON.parse(event.body);

    if (!message) {
      console.log('ERROR: No message provided');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message is required' })
      };
    }

    console.log('✅ User question:', message);

    console.log('🔄 Creating embedding...');
    const questionEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: message,
    });

    console.log('✅ Created embedding for question');

    console.log('🔄 Querying Pinecone...');
    console.log('🔄 Initializing index:', INDEX_NAME);
    const index = pinecone.index(INDEX_NAME);
    console.log('✅ Index initialized');
    const searchResults = await index.query({
      vector: questionEmbedding.data[0].embedding,
      topK: 3,
      includeMetadata: true
    });

    console.log(`✅ Found ${searchResults.matches.length} relevant documents`);

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

FORMATTING RULES (must follow exactly):
- Use Markdown only, no raw HTML.
- Bold with **text** (not <strong>).
- Bullet lists: each item on its own line, starting with "- ".
- Numbered lists: "1. ", "2. ", etc, each on its own line.
- Exactly TWO line breaks between major sections or paragraphs.
- Exactly ONE line break between items in a list.
- After every heading (### …), insert ONE blank line before content.
- Never run multiple steps together in a single paragraph.

ANSWER POLICY - Tailor response to the question type:

FOR MENTAL HEALTH PROFESSIONAL CHOICE QUESTIONS ("who should I see", "psychologist vs counsellor"):
1. Empathy opener: "It's completely normal to feel uncertain about who to see—there are several options and they each work a bit differently."

2. MVP acknowledgment (if applicable): For ANY question mentioning specific practitioners, locations, gender preferences, or directories, include somewhere in the FIRST PARAGRAPH (but NOT as the opening sentence): "We're in development and can't offer specific practitioner recommendations just yet. The chatbot will be able to help you find which type of professional is best for you, how to access them, and how much you can get back from Medicare."

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

FORMATTING RULES - CRITICAL:
- Put a blank line before and after bullet point lists
- Within bullet point lists, put each bullet on its own line with NO extra blank lines between bullets
- Put a blank line between different sections/paragraphs
- Use bullet points with simple dashes: "- Point here"
- Use **bold text** strategically to highlight important terms and improve readability
- Be consistent with bold formatting within each response
- Keep numbers concrete, then mention potential gap fees unless bulk-billed
- Avoid jargon; if you must use a term, give a 1‑line explanation

EXAMPLE TARGET RESPONSE:
For "I'm not sure who to see about anxiety and relationship issues":

"It's completely normal to feel uncertain about who to see—there are several options and they each work a bit differently. We're in development and can't offer specific practitioner recommendations just yet, but I can help you understand which type of professional is best for you, how to access them, and how much you can get back from Medicare.

For anxiety and relationship concerns, people usually see a psychologist or a counsellor. Here are your main options:

- **Clinical psychologist**: 6+ years training, specializes in mental health disorders, Medicare rebate $145.25
- **General psychologist**: 4+ years training, general counselling, Medicare rebate $98.95  
- **Counsellor**: Variable training, talk therapy focus, no Medicare rebates ($80-150 private)
- **Psychiatrist**: Medical doctor, can prescribe medication, Medicare rebates available

The right person depends on your specific needs and budget, but rapport matters a lot—you want someone you feel comfortable opening up to.

Your next steps are to get a Mental Health Treatment Plan from your GP for Medicare rebates, then search Psychology Today or call a few practitioners to ask about their experience with anxiety and relationships.

Is there anything specific about the process or costs you'd like me to explain further?"

${context}`;

    console.log('🔄 Calling GPT-5 with Responses API...');
    const input = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: 'Begin your answer immediately with a short summary before giving details.' },
      { role: 'user', content: message }
    ];

    const r = await openai.responses.create({
      model: "gpt-5",
      input,
      reasoning: { effort: "low" },
      max_output_tokens: 900
    });

    console.log('✅ GPT-5 response received');
    const response = r.output_text ?? r.output?.[0]?.content?.[0]?.text ?? "";

    console.log('✅ Generated response:', response);
    console.log('✅ Response object:', r);
    console.log('✅ Response length:', response?.length || 0);

    if (!response || response.trim() === '') {
      console.log('❌ Empty response detected, using fallback');
      const fallbackResponse = "I understand you're looking for help with anxiety, relationships, and internal stress. I'm experiencing a technical issue with my detailed response, but I can help you find the right professional. For your needs, a psychologist would be most suitable, particularly one who specializes in anxiety and relationship issues. In Byron Bay, you can find qualified psychologists through the Australian Psychological Society directory or Psychology Today. Would you like me to explain the difference between psychologists, counsellors, and therapists?";
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: fallbackResponse,
          debug: {
            contextFound: searchResults.matches.length > 0,
            relevantDocs: searchResults.matches.length,
            emptyResponse: true
          }
        })
      };
    }

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
    console.error('❌ ERROR in chat function:', error.message);
    console.error('❌ Full error object:', error);
    console.error('❌ Error stack:', error.stack);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message,
        type: error.type || 'unknown',
        code: error.code || 'unknown'
      })
    };
  }
};