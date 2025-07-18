# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Health Road is a mental health navigation website for Australians, specifically focused on helping users access mental health services in Australia and Northern Rivers NSW. The application consists of:

- A static HTML frontend (`index.html`) with embedded chat interface
- A Netlify serverless function (`netlify/functions/chat.js`) that handles chat interactions
- Integration with OpenAI GPT-4o-mini for chat responses
- Pinecone vector database for knowledge retrieval and RAG (Retrieval Augmented Generation)

## Architecture

### Frontend
- Single-page application built with vanilla HTML, CSS, and JavaScript
- ChatGPT-style conversational interface with full-page layout
- Features auto-resizing textarea, typing indicators, and responsive design
- Chat interface communicates with backend via fetch API to `/.netlify/functions/chat`

### Backend
- Serverless function architecture using Netlify Functions
- Chat function (`netlify/functions/chat.js`) handles:
  - CORS headers for cross-origin requests
  - User message processing
  - OpenAI embeddings generation using `text-embedding-3-large`
  - Pinecone vector search for relevant context retrieval (top-3 matches)
  - OpenAI chat completion using GPT-4o-mini with RAG context
  - System prompt engineering for Australian mental health focus
  - Response formatting and error handling

### Dependencies
- `openai`: ^4.20.0 - OpenAI API client
- `@pinecone-database/pinecone`: ^1.1.0 - Pinecone vector database client

## Development Commands

This project uses Netlify for deployment and doesn't have traditional build scripts. Instead:

- **Local development**: Use Netlify CLI `netlify dev` to run functions locally
- **Deploy**: Push to main branch triggers automatic Netlify deployment
- **No linting/testing**: No configured lint or test commands in package.json

## Environment Variables

Required environment variables for the chat function:
- `PINECONE_API_KEY`: Pinecone database API key
- `PINECONE_ENVIRONMENT`: Pinecone environment
- `PINECONE_PROJECT_ID`: Pinecone project identifier
- `OPENAI_API_KEY`: OpenAI API key

## Deployment Configuration

- `netlify.toml` configures:
  - Functions directory: `netlify/functions`
  - Publish directory: `.` (root)
  - Node bundler: `esbuild`

## Key Integration Points

- Chat endpoint: `https://healthroad.netlify.app/.netlify/functions/chat`
- Pinecone index: `health-road-knowledge`
- OpenAI models: `text-embedding-3-large` for embeddings, `gpt-4o-mini` for chat
- Frontend chat logic embedded in `index.html` (single-file architecture)
- Message handling and API communication via fetch API
- Custom domain: `healthcaresystem.com.au`

## RAG Implementation Details

- Vector similarity search retrieves top-3 most relevant documents from Pinecone
- Retrieved context is injected into system prompt for OpenAI chat completion
- Temperature set to 0.7 for balanced creativity and consistency
- Max tokens limited to 500 for concise, focused responses
- Specialized system prompt for Australian mental health guidance