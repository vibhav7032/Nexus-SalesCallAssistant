# Nexus – AI Sales Call Assistant

Nexus is an AI-powered sales call assistant built to provide real-time conversation intelligence during live sales calls and actionable insights after they end.

Sales conversations move fast. Important signals, intent, and objections are easy to miss while listening, responding, and thinking ahead at the same time. Nexus is designed to capture that context automatically and surface it when it matters, without interrupting the flow of the conversation.

## What Nexus Does

- Joins live sales calls as a voice AI agent  
- Transcribes conversations in real time  
- Tracks customer sentiment during the call  
- Surfaces context-aware suggestions based on what the customer just said  
- Stores calls as searchable conversation history  
- Generates concise AI-powered summaries instead of long recordings  

## Architecture Overview

Nexus consists of a real-time AI voice agent and a conversation intelligence platform. The voice agent handles live audio and transcription, while the backend analyzes sentiment, stores call data, and generates insights that can be reviewed through the frontend interface.

## Tech Stack

**Backend:** Python, FastAPI  
**Database:** MongoDB Atlas  
**Frontend:** React, TypeScript, TailwindCSS  
**AI & Voice:** Groq (Llama 3.3 70B), LiveKit (WebRTC), Deepgram (STT/TTS)  
**Authentication:** JWT, bcrypt  

## Getting Started

### Prerequisites

- Node.js (v18+)
- Python 3.9+
- MongoDB Atlas account
- API keys for Groq, LiveKit, and Deepgram

### Environment Setup

Create a `.env` file in the root directory using the provided `.env.example`:

```env
GROQ_API_KEY=your_groq_api_key
LIVEKIT_WS_URL=your_livekit_ws_url
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
DEEPGRAM_API_KEY=your_deepgram_api_key
MONGODB_URI=your_mongodb_atlas_uri
JWT_SECRET_KEY=your_jwt_secret
```

### Installation & Running

**Backend**
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

**Agent** (in a new terminal)
```bash
cd agent
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python agent.py dev
```

**Frontend** (in a new terminal)
```bash
cd frontend
npm install
npm run dev
```

The application will be available at:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`

**Note:** Keep all three terminals running simultaneously for the full application to work.

## Project Structure

```
├── backend/
│   ├── main.py
│   ├── agent.py
│   └── services/
├── frontend/
│   ├── src/
│   ├── pages/
│   └── components/
├── .env.example
└── README.md

```

## Key Features

### Real-Time Analysis
Live sentiment tracking and contextual suggestions during active calls using Groq's Llama 3.3 70B model for sub-second inference.

### Conversation Intelligence
Searchable conversation history with AI-generated summaries, key points extraction, and pattern detection across multiple calls.

### Secure & User-Specific
JWT-based authentication with bcrypt password hashing and user-scoped data isolation at the database level.

## Development Approach

This project was built using Agile methodology with short sprints, continuous integration, and iterative development based on user feedback and testing.

## Acknowledgments

Built during an internship as part of a collaborative team effort, with guidance from experienced mentors and contributions from team members specializing in different parts of the stack.

## Disclaimer

This project was developed for learning and demonstration purposes. It is not production-ready without additional security hardening, scalability optimization, and compliance considerations for handling sensitive conversation data.

## License

This project is for educational purposes only.

---

