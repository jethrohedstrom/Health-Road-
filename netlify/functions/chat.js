const OpenAI = require('openai');

exports.handler = async function(event, context) {
  console.log('Function started, method:', event.httpMethod);
  
  // Handle CORS preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://healthcaresystem.com.au',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST'
      },
      body: ''
    };
  }

  // Only allow POST requests after handling OPTIONS
  if (event.httpMethod !== 'POST') {
    console.log('Method not allowed:', event.httpMethod);
    return { 
      statusCode: 405, 
      body: 'Method Not Allowed' 
    };
  }

  try {
    console.log('Parsing request body');
    const body = JSON.parse(event.body);
    const userMessage = body.message;
    console.log('User message:', userMessage);

    // Check if environment variables exist
    console.log('API Key exists:', !!process.env.OPENAI_API_KEY);
    console.log('Assistant ID exists:', !!process.env.ASSISTANT_ID);

    // Initialize OpenAI with API key from environment variable
    console.log('Initializing OpenAI');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    console.log('Creating thread');
    const thread = await openai.beta.threads.create();
    console.log('Thread created:', thread.id);

    // Add the user's message to the thread
    console.log('Adding message to thread');
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage
    });

    console.log('Running assistant');
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID
    });

    console.log('Waiting for completion');
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    
    while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log('Run status:', runStatus.status);
    }

    console.log('Getting messages');
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data[0].content[0].text.value;
    console.log('Assistant response received');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://healthcaresystem.com.au'
      },
      body: JSON.stringify({
        response: assistantMessage
      })
    };
    
  } catch (error) {
    console.error('Detailed error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://healthcaresystem.com.au'
      },
      body: JSON.stringify({ 
        error: 'Sorry, I encountered an error. Please try again.' 
      })
    };
  }
};
