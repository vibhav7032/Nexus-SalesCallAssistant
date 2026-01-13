from dotenv import load_dotenv
import os
import asyncio
import logging
import httpx
import time
import json

from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions, UserInputTranscribedEvent
from livekit.plugins import deepgram, silero, openai  # ✅ CHANGED: openai instead of google

# Enable debug logging
logging.basicConfig(level=logging.DEBUG)

# Load environment variables
load_dotenv(".env")

# Assistant agent
class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions="You are a sales person convice the customers please to sell an Educational courses on AI and Machine learning keep it in one setnece")
        self.fastapi_url = "http://localhost:8000"
        self.user_email = None  # Store user email

    async def send_transcript_to_fastapi(self, text: str, room_id: str, speaker: str = "user"):
        """Send transcript (user or assistant) to FastAPI backend for processing"""
        try:
            payload = {
                "text": text,
                "speaker": speaker,
                "timestamp": time.time(),
                "room_id": room_id,
                "user_email": self.user_email  # ✅ Include user email
            }
            print(f"Sending to FastAPI: {payload}")
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.fastapi_url}/process-transcription",
                    json=payload
                )
                if response.status_code == 200:
                    result = response.json()
                    print(f"FastAPI response: {result}")
                else:
                    print(f"FastAPI error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Error sending to FastAPI: {e}")

    async def save_session(self, room_id: str):
        """Call FastAPI to save session when room disconnects"""
        try:
            # ✅ Include user_email if available
            params = {"room_id": room_id}
            if self.user_email:
                params["user_email"] = self.user_email
                print(f"💾 Saving session for user: {self.user_email}")
            else:
                print("⚠️ WARNING: No user_email available, session won't be user-specific!")
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.fastapi_url}/save-session",
                    params=params
                )
                result = response.json()
                print(f"✅ Save session response: {result}")
        except Exception as e:
            print(f"❌ Error saving session: {e}")

# Async entrypoint
async def entrypoint(ctx: agents.JobContext):
    assistant = Assistant()

    # ✅ Extract user email from room metadata
    if hasattr(ctx.room, 'metadata') and ctx.room.metadata:
        try:
            metadata = json.loads(ctx.room.metadata)
            assistant.user_email = metadata.get('user_email')
            if assistant.user_email:
                print(f"✅ User email from room metadata: {assistant.user_email}")
            else:
                print("⚠️ No user_email in room metadata")
        except Exception as e:
            print(f"⚠️ Failed to parse room metadata: {e}")
    else:
        print("⚠️ No room metadata available")

    # ✅ CHANGED: Prepare session with Groq via OpenAI plugin
    session = AgentSession(
        stt=deepgram.STT(
            model="nova-3",
            language="multi",
            api_key=os.getenv("DEEPGRAM_API_KEY")
        ),
        tts=deepgram.TTS(
            model="aura-asteria-en",
            api_key=os.getenv("DEEPGRAM_API_KEY")
        ),
        llm=openai.LLM(
            model="llama-3.3-70b-versatile",  # ✅ CHANGED: Groq model
            api_key=os.getenv("GROQ_API_KEY"),  # ✅ CHANGED: Use GROQ_API_KEY
            base_url="https://api.groq.com/openai/v1",  # ✅ CHANGED: Groq's OpenAI-compatible endpoint
        ),
        vad=silero.VAD.load(),
        turn_detection=None
    )

    room_name = ctx.room.name

    # Register shutdown callback
    async def _on_shutdown():
        try:
            await asyncio.wait_for(assistant.save_session(room_name), timeout=12.0)
        except Exception as e:
            print(f"❌ Shutdown save_session failed: {e}")

    ctx.add_shutdown_callback(_on_shutdown)

    @session.on("session_disconnected")
    def on_session_disconnected(event):
        print(f"Session disconnected for room={room_name}, scheduling save...")

    # Handle user speech (final transcript)
    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event: UserInputTranscribedEvent):
        if event.is_final:
            print(f"Final user transcript: {event.transcript}")
            asyncio.create_task(
                assistant.send_transcript_to_fastapi(event.transcript, room_name, speaker="user")
            )
        else:
            print(f"Interim transcript: {event.transcript}")

    # Handle agent (assistant) messages
    @session.on("conversation_item_added")
    def on_conversation_item_added(event):
        if hasattr(event.item, "role") and event.item.role == "assistant":
            print(f"Agent message: {event.item.text_content}")
            asyncio.create_task(
                assistant.send_transcript_to_fastapi(event.item.text_content, room_name, speaker="assistant")
            )

    # Start session and connect
    await session.start(
        room=ctx.room,
        agent=assistant,
        room_input_options=RoomInputOptions(
            noise_cancellation=None,
            close_on_disconnect=False
        ),
    )

    await ctx.connect()

    # Initial greeting
    await session.generate_reply(
        instructions="Hello! I am listening. How can I assist you today?"
    )

# Main entrypoint
if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            api_key=os.getenv("LIVEKIT_API_KEY"),
            api_secret=os.getenv("LIVEKIT_API_SECRET"),
            ws_url=os.getenv("LIVEKIT_WS_URL"),
        )
    )