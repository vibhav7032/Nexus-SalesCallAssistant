import os
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Literal, List, Dict, Optional

from fastapi import FastAPI, HTTPException, Query, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from dotenv import load_dotenv
import uvicorn
from groq import Groq
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import PyMongoError

# ✅ NEW: Auth imports
from passlib.context import CryptContext
from jose import JWTError, jwt

import hashlib

# ✅ LiveKit
from livekit import api

# -------------------------------------------------------------------
# SETUP
# -------------------------------------------------------------------
load_dotenv()
logging.basicConfig(level=logging.INFO)

# === Groq Setup ===
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found in environment variables")
groq_client = Groq(api_key=GROQ_API_KEY)

# === LiveKit Setup ===
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_WS_URL = os.getenv("LIVEKIT_WS_URL", "ws://localhost:7880")

if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
    raise ValueError("Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET")

# ✅ NEW: JWT Secret (add this to your .env file)
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# ✅ NEW: Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# === MongoDB Setup ===
MONGO_URI = os.getenv("MONGODB_URI")
if not MONGO_URI:
    raise ValueError("MONGODB_URI not found in environment variables")

client = MongoClient(MONGO_URI, connect=False)
db = client["sales_agent"]
messages_collection = db["messages"]
sessions_collection = db["transcripts"]
users_collection = db["users"]  # ✅ NEW: Users collection

# ✅ SAFE INDEX CREATION
existing_msg_indexes = messages_collection.index_information()
if "room_ts_idx" not in existing_msg_indexes:
    messages_collection.create_index(
        [("room_id", ASCENDING), ("sent_ts", ASCENDING)],
        name="room_ts_idx"
    )

existing_session_indexes = sessions_collection.index_information()
if "session_ts_idx" not in existing_session_indexes:
    sessions_collection.create_index(
        [("session_id", ASCENDING), ("timestamp", ASCENDING)],
        name="session_ts_idx"
    )

# ✅ NEW: User email index
existing_user_indexes = users_collection.index_information()
if "email_idx" not in existing_user_indexes:
    users_collection.create_index([("email", ASCENDING)], unique=True, name="email_idx")

# === In-memory temporary stores ===
STORE: Dict[str, List[dict]] = {}
STORE_USERS: Dict[str, str] = {}  # ✅ NEW: Maps room_id -> user_email
ROOM_TO_USER: Dict[str, str] = {}  # ✅ NEW: Map room_id to user_email when room is created
ANALYSIS_STORE: Dict[str, dict] = {}

# -------------------------------------------------------------------
# ✅ NEW: AUTH HELPER FUNCTIONS
# -------------------------------------------------------------------


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    # Hash the password with SHA256 first to ensure it's under 72 bytes
    password_hash = hashlib.sha256(plain_password.encode()).hexdigest()
    return pwd_context.verify(password_hash, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash a password"""
    # Hash the password with SHA256 first to ensure it's under 72 bytes
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    return pwd_context.hash(password_hash)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(authorization: Optional[str] = Header(None)):
    """Dependency to get current user from JWT token"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = users_collection.find_one({"email": email}, {"_id": 0, "password": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header")

# -------------------------------------------------------------------
# ✅ NEW: AUTH MODELS
# -------------------------------------------------------------------
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class UserResponse(BaseModel):
    email: str
    name: str

# -------------------------------------------------------------------
# EXISTING MODELS (UNCHANGED)
# -------------------------------------------------------------------


class TranscriptIn(BaseModel):
    text: str = Field(..., min_length=1)
    speaker: Literal["user", "assistant"]
    timestamp: float
    room_id: str
    user_email: Optional[str] = None  # ✅ NEW: Optional user email


class SentimentAnalysis(BaseModel):
    sentiment: str
    confidence: float
    key_points: List[str]
    recommendation_to_salesperson: str

class TranscriptResponse(BaseModel):
    ok: bool
    room_id: str
    count_in_room: int
    analysis: Optional[SentimentAnalysis] = None
    latest_user_message: Optional[str] = None

class SaveSessionResponse(BaseModel):
    ok: bool
    room_id: str
    mongo_id: Optional[str] = None
    total_messages: int

class TokenRequest(BaseModel):
    room_name: str
    participant_name: str

class MessageResponse(BaseModel):
    text: str
    speaker: Literal["user", "assistant"]
    sent_ts: float
    received_at: str
    room_id: str

class AnalysisResponse(BaseModel):
    room_id: str
    analysis: Optional[SentimentAnalysis]

# -------------------------------------------------------------------
# APP SETUP
# -------------------------------------------------------------------
app = FastAPI(title="Sales Voice Backend", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------
# ✅ NEW: AUTH ENDPOINTS
# -------------------------------------------------------------------

@app.post("/register", response_model=Token)
async def register(user: UserRegister):
    """Register a new user"""
    try:
        # Check if user already exists
        existing_user = users_collection.find_one({"email": user.email})
        if existing_user:
            logging.error(f"❌ Registration failed: Email {user.email} already exists")
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Hash password (SHA256 + bcrypt handled inside get_password_hash)
        hashed_password = get_password_hash(user.password)
        logging.info(f"✅ Password hashed for {user.email}")
        
        # Create user document
        user_doc = {
            "email": user.email,
            "password": hashed_password,
            "name": user.name or user.email.split('@')[0],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        # Insert into database
        result = users_collection.insert_one(user_doc)
        logging.info(f"✅ User {user.email} created with ID: {result.inserted_id}")
        
        # Create access token
        access_token = create_access_token(data={"sub": user.email})
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user={"email": user.email, "name": user_doc["name"]}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logging.exception(f"❌ Registration error for {user.email}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")



@app.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    """Login user"""
    try:
        # Find user
        user = users_collection.find_one({"email": credentials.email})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Verify password (SHA256 + bcrypt handled inside verify_password)
        if not verify_password(credentials.password, user["password"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Create access token
        access_token = create_access_token(data={"sub": user["email"]})
        
        # Handle both old (full_name) and new (name) users
        user_name = user.get("name") or user.get("full_name") or user["email"].split('@')[0]
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user={"email": user["email"], "name": user_name}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Login error")
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/verify", response_model=UserResponse)
async def verify_token(current_user: dict = Depends(get_current_user)):
    """Verify JWT token and return user info"""
    return UserResponse(
        email=current_user["email"],
        name=current_user.get("name", current_user["email"].split('@')[0])
    )

# -------------------------------------------------------------------
# EXISTING GEMINI ANALYSIS FUNCTIONS (UNCHANGED)
# -------------------------------------------------------------------
def analyze_with_groq(user_text: str) -> dict:
    prompt = f"""
Analyze the customer's message:
"{user_text}"

Return strict JSON only:
{{
  "sentiment": "positive" | "neutral" | "negative",
  "confidence": 0..1,
  "key_points": ["point1", "point2"],
  "recommendation_to_salesperson": "short advice"
}}
"""

    try:
        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
            {"role": "system", "content": "You are a sales conversation analyst. Always respond with valid JSON only, no markdown or explanations."},
            {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=500
        )
        raw = resp.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        parsed = json.loads(raw)

        return {
            "sentiment": parsed.get("sentiment", "neutral").lower(),
            "confidence": float(parsed.get("confidence", 0.0)),
            "key_points": parsed.get("key_points", []),
            "recommendation_to_salesperson": parsed.get(
                "recommendation_to_salesperson",
                "Continue the conversation normally."
            ),
        }

    except Exception as e:
        logging.exception("Groq error")
        return {
            "sentiment": "neutral",
            "confidence": 0.0,
            "key_points": [],
            "recommendation_to_salesperson": "Unable to analyze.",
        }

def analyze_full_conversation(messages: List[dict]) -> dict:
    """Analyze the entire conversation for comprehensive insights"""
    
    if not messages or len(messages) == 0:
        return {
            "sentiment": "neutral",
            "confidence": 0.5,
            "key_points": ["No conversation data"],
            "recommendation_to_salesperson": "No messages to analyze.",
        }
    
    conversation_text = "\n".join([
        f"{'Customer' if msg['speaker'] == 'user' else 'Agent'}: {msg['text']}"
        for msg in messages
    ])
    
    if len(conversation_text) > 3000:
        conversation_text = conversation_text[-3000:]
    
    logging.info(f"📝 Conversation text length: {len(conversation_text)} characters")
    
    prompt = f"""
Analyze this complete sales conversation about AI/ML educational courses:

CONVERSATION:
{conversation_text}

Provide a comprehensive analysis in ONLY valid JSON format (no markdown, no code blocks):

{{
  "sentiment": "positive" OR "neutral" OR "negative",
  "confidence": 0.0 to 1.0,
  "key_points": ["point1", "point2", "point3"],
  "customer_interests": ["interest1", "interest2"],
  "customer_concerns": ["concern1", "concern2"],
  "recommendation_to_salesperson": "clear actionable recommendation"
}}

Analysis Guidelines:
- sentiment: "positive" if customer is interested/engaged, "negative" if explicitly rejecting/upset, "neutral" if undecided
- confidence: 0.8+ for clear sentiment, 0.5-0.7 for mixed signals
- key_points: 3-5 most important things from the ENTIRE conversation
- customer_interests: what did the customer ask about or show interest in?
- customer_concerns: what objections or hesitations did they express?
- recommendation: ONE specific action the salesperson should take next

IMPORTANT: Always provide at least 3 key points based on the conversation content.
"""

    try:
        logging.info("🤖 Calling Groq API for full conversation analysis...")
        
        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
            {"role": "system", "content": "You are an expert sales conversation analyst. Always respond with valid JSON only, no markdown or explanations."},
            {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1000
        )
        
        logging.info("✅ Groq API responded successfully")
        
        raw = resp.choices[0].message.content.strip()
        logging.info(f"📄 Raw response length: {len(raw)} characters")

        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        parsed = json.loads(raw)
        logging.info("✅ JSON parsed successfully")

        all_key_points = []
        all_key_points.extend(parsed.get("key_points", []))
        all_key_points.extend(parsed.get("customer_interests", []))
        all_key_points.extend(parsed.get("customer_concerns", []))
        
        logging.info(f"📊 Extracted {len(all_key_points)} key points from analysis")
        
        if not all_key_points:
            logging.warning("⚠️ No key points in Groq response, extracting from messages")
            user_messages = [m for m in messages if m['speaker'] == 'user']
            if user_messages:
                all_key_points = [f"Customer message: {m['text'][:80]}" for m in user_messages[:3]]
            else:
                all_key_points = ["Conversation completed"]

        result = {
            "sentiment": parsed.get("sentiment", "neutral").lower(),
            "confidence": max(float(parsed.get("confidence", 0.6)), 0.5),
            "key_points": all_key_points[:7],
            "recommendation_to_salesperson": parsed.get(
                "recommendation_to_salesperson",
                "Follow up based on customer interests expressed in the conversation."
            ),
        }
        
        logging.info(f"✅ Analysis complete: {result['sentiment']} sentiment with {len(result['key_points'])} key points")
        return result
        
    except json.JSONDecodeError as e:
        logging.error(f"❌ JSON parse error: {e}")
        user_messages = [m for m in messages if m['speaker'] == 'user']
        return {
            "sentiment": "neutral",
            "confidence": 0.5,
            "key_points": [m['text'][:100] for m in user_messages[:5]] if user_messages else ["Customer engaged in conversation"],
            "recommendation_to_salesperson": "Review full transcript for context and follow up appropriately.",
        }
    except Exception as e:
        logging.error(f"❌ Full conversation analysis error: {type(e).__name__}: {str(e)}")
        logging.exception("Full error traceback:")
        user_messages = [m for m in messages if m['speaker'] == 'user']
        return {
            "sentiment": "neutral",
            "confidence": 0.5,
            "key_points": [
                f"Conversation had {len(messages)} total messages",
                f"Customer spoke {len(user_messages)} times",
                "See transcript for details"
            ],
            "recommendation_to_salesperson": "Review the conversation transcript and follow up based on customer's responses.",
        }

# -------------------------------------------------------------------
# LIVEKIT TOKEN ENDPOINT (UNCHANGED)
# -------------------------------------------------------------------

class TokenRequest(BaseModel):
    room_name: str
    participant_name: str
    user_email: Optional[str] = None 


@app.post("/get-token")
async def get_token(request: TokenRequest):
    try:
        # ✅ NEW: Save room-to-user mapping
        if request.user_email:
            ROOM_TO_USER[request.room_name] = request.user_email
            logging.info(f"✅ Mapped room {request.room_name} to user {request.user_email}")
        
        token = api.AccessToken(
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET
        )

        token.with_identity(request.participant_name)
        token.with_name(request.participant_name)
        
        token.with_grants(
            api.VideoGrants(
                room_join=True,
                room=request.room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )

        jwt_token = token.to_jwt()

        return {
            "token": jwt_token,
            "url": LIVEKIT_WS_URL,
            "room": request.room_name,
        }

    except Exception as e:
        logging.exception("Token generation error")
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------------------------
# PROCESS TRANSCRIPTION (UNCHANGED)
# -------------------------------------------------------------------
@app.post("/process-transcription", response_model=TranscriptResponse)
async def process_transcription(payload: TranscriptIn):
    try:
        # ✅ NEW: Get user_email from payload OR from room mapping
        user_email = payload.user_email or ROOM_TO_USER.get(payload.room_id)
        
        # ✅ Track which user owns this room
        if user_email and payload.room_id not in STORE_USERS:
            STORE_USERS[payload.room_id] = user_email
            logging.info(f"✅ Room {payload.room_id} assigned to {user_email}")
        
        text_clean = payload.text.strip()
        if not text_clean:
            raise HTTPException(422, "Empty message")

        record = {
            "text": text_clean,
            "speaker": payload.speaker,
            "sent_ts": float(payload.timestamp),
            "received_at": datetime.now(timezone.utc).isoformat(),
            "room_id": payload.room_id,
        }

        STORE.setdefault(payload.room_id, []).append(record)

        try:
            messages_collection.insert_one(record.copy())
        except PyMongoError as e:
            logging.error(f"Mongo insert failed: {e}")

        analysis_obj = None
        latest_user_message = None

        if payload.speaker == "user":
            latest_user_message = text_clean
            analysis_dict = analyze_with_groq(text_clean)
            ANALYSIS_STORE[payload.room_id] = analysis_dict
            analysis_obj = SentimentAnalysis(**analysis_dict)
            
            logging.info(
                f"✅ Analysis: {analysis_obj.sentiment} "
                f"({analysis_obj.confidence:.2f}) - {analysis_obj.recommendation_to_salesperson}"
            )

        return TranscriptResponse(
            ok=True,
            room_id=payload.room_id,
            count_in_room=len(STORE[payload.room_id]),
            analysis=analysis_obj,
            latest_user_message=latest_user_message,
        )

    except Exception as e:
        logging.exception("Processing error")
        raise HTTPException(500, str(e))

# -------------------------------------------------------------------
# GET LATEST ANALYSIS (UNCHANGED)
# -------------------------------------------------------------------
@app.get("/analysis/{room_id}", response_model=AnalysisResponse)
async def get_latest_analysis(room_id: str):
    try:
        if room_id in ANALYSIS_STORE:
            analysis_dict = ANALYSIS_STORE[room_id]
            return AnalysisResponse(
                room_id=room_id,
                analysis=SentimentAnalysis(**analysis_dict)
            )
        
        return AnalysisResponse(
            room_id=room_id,
            analysis=None
        )

    except Exception as e:
        logging.exception("Error fetching analysis")
        raise HTTPException(500, str(e))

# -------------------------------------------------------------------
# GET MESSAGES (UNCHANGED)
# -------------------------------------------------------------------
@app.get("/messages/{room_id}")
async def get_messages(room_id: str, limit: int = Query(50, ge=1, le=500)):
    try:
        messages = STORE.get(room_id, [])
        
        if len(messages) < limit:
            try:
                mongo_messages = list(
                    messages_collection
                    .find({"room_id": room_id}, {"_id": 0})
                    .sort("sent_ts", DESCENDING)
                    .limit(limit)
                )
                all_messages = messages + mongo_messages
                all_messages.sort(key=lambda x: x.get("sent_ts", 0))
                messages = all_messages[-limit:] if len(all_messages) > limit else all_messages
            except PyMongoError as e:
                logging.error(f"MongoDB query error: {e}")
        
        return {
            "room_id": room_id,
            "messages": messages[-limit:]
        }

    except Exception as e:
        logging.exception("Error fetching messages")
        raise HTTPException(500, str(e))

# -------------------------------------------------------------------
# ⚠️ UPDATED: SAVE SESSION (NOW INCLUDES user_email)
# -------------------------------------------------------------------
@app.post("/save-session", response_model=SaveSessionResponse)
async def save_session(
    room_id: str = Query(...),
    user_email: Optional[str] = Query(None)  # ✅ NEW: Optional user email
):
    try:
        if room_id not in STORE:
            existing = sessions_collection.find_one({"session_id": room_id})
            if existing:
                return SaveSessionResponse(
                    ok=True,
                    room_id=room_id,
                    mongo_id=str(existing.get("_id", "")),
                    total_messages=existing.get("total_messages", 0),
                )
            raise HTTPException(404, "Room not found in memory or database")

        messages = STORE[room_id]

        existing_session = sessions_collection.find_one({"session_id": room_id})
        
        logging.info(f"🔍 Analyzing full conversation with {len(messages)} messages")
        full_analysis = analyze_full_conversation(messages)
        
        # ✅ NEW: Include user_email in session document
        session_update = {
            "messages": messages,
            "total_messages": len(messages),
            "latest_analysis": full_analysis,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        if user_email:
            session_update["user_email"] = user_email  # ✅ NEW: Add user email
        
        if existing_session:
            sessions_collection.update_one(
                {"session_id": room_id},
                {"$set": session_update}
            )
            mongo_id = str(existing_session["_id"])
        else:
            session_doc = {
                "session_id": room_id,
                **session_update
            }
            result = sessions_collection.insert_one(session_doc)
            mongo_id = str(result.inserted_id)

        logging.info(f"💾 Session {room_id} saved with {len(messages)} messages")

        return SaveSessionResponse(
            ok=True,
            room_id=room_id,
            mongo_id=mongo_id,
            total_messages=len(messages),
        )

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Save error")
        raise HTTPException(500, str(e))

# -------------------------------------------------------------------
# ⚠️ UPDATED: GET CONVERSATIONS (NOW FILTERS BY USER)
# -------------------------------------------------------------------


# -------------------------------------------------------------------
# ✅ FIXED: GET CONVERSATIONS (NOW FILTERS BY USER AND IGNORES OLD DATA)
# -------------------------------------------------------------------

@app.get("/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    try:
        user_email = current_user["email"]
        
        # ✅ NEW: Filter in-memory sessions by user
        in_memory = [
            {"room_id": room_id, "count": len(messages)}
            for room_id, messages in STORE.items()
            if STORE_USERS.get(room_id) == user_email  # ✅ Only show user's sessions
        ]
        
        logging.info(f"📝 In-memory sessions for {user_email}: {len(in_memory)}")
        
        # ✅ Get saved sessions from MongoDB filtered by user
        try:
            saved_sessions = list(
                sessions_collection
                .find(
                    {
                        "user_email": {"$exists": True},
                        "user_email": user_email
                    },
                    {"_id": 0, "session_id": 1, "total_messages": 1, "timestamp": 1}
                )
                .sort("timestamp", DESCENDING)
                .limit(50)
            )
            mongo_sessions = [
                {"room_id": s["session_id"], "count": s.get("total_messages", 0)}
                for s in saved_sessions
            ]
            
            logging.info(f"💾 MongoDB sessions for {user_email}: {len(mongo_sessions)}")
            
        except PyMongoError as e:
            logging.error(f"MongoDB query error: {e}")
            mongo_sessions = []
        
        # Combine and deduplicate
        all_sessions = {}
        for sess in in_memory + mongo_sessions:
            all_sessions[sess["room_id"]] = sess
        
        logging.info(f"✅ Total sessions for {user_email}: {len(all_sessions)}")
        
        return {
            "sessions": list(all_sessions.values())
        }
    except Exception as e:
        logging.exception(f"Error in get_conversations: {e}")
        raise HTTPException(500, str(e))



# -------------------------------------------------------------------
# ⚠️ UPDATED: GET SESSION (NOW CHECKS USER OWNERSHIP)
# -------------------------------------------------------------------
@app.get("/session/{session_id}")
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)  # ✅ NEW: Require auth
):
    try:
        user_email = current_user["email"]
        
        # Try MongoDB first
        doc = sessions_collection.find_one({"session_id": session_id}, {"_id": 0})
        
        if doc:
            # ✅ NEW: Check if user owns this session (or if it's an old session without user_email)
            if "user_email" in doc and doc["user_email"] != user_email:
                raise HTTPException(403, "Access denied: You don't own this session")
            return doc
        
        # If not in MongoDB, check in-memory
        if session_id in STORE:
            return {
                "session_id": session_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "messages": STORE[session_id],
                "total_messages": len(STORE[session_id]),
                "latest_analysis": ANALYSIS_STORE.get(session_id),
                "user_email": user_email  # ✅ NEW: Include user email
            }
        
        raise HTTPException(404, f"Session not found: {session_id}")
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Session fetch error")
        raise HTTPException(500, str(e))

# -------------------------------------------------------------------
# HEALTH CHECK (UNCHANGED)
# -------------------------------------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "healthy", "rooms": len(STORE)}

# -------------------------------------------------------------------
# DEBUG ENDPOINT (UNCHANGED)
# -------------------------------------------------------------------
@app.get("/debug/sessions")
async def debug_sessions():
    try:
        sessions = list(sessions_collection.find({}, {"_id": 0}).limit(10))
        return {"count": len(sessions), "sessions": sessions}
    except Exception as e:
        return {"error": str(e)}

# -------------------------------------------------------------------
# MAIN ENTRY
# -------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)