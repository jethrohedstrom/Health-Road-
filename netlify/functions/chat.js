// Simple test function - we'll upgrade this to connect to OpenAI next
exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: 'Method Not Allowed' 
    };
  }

  try {
    // Get the message from the request
    const body = JSON.parse(event.body);
    const userMessage = body.message;
    
    // For now, just return a test response
    // (We'll connect to OpenAI in the next step)
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        response: `Test response: You said "${userMessage}". OpenAI connection coming next!`
      })
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Something went wrong' })
    };
  }
};
