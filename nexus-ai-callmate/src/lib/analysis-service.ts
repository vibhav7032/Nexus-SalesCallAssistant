// src/lib/analysis-service.ts
import { fetchWithAuth, API_URL } from './api';

export type Sentiment = "positive" | "neutral" | "negative";

export interface Analysis {
  sentiment: Sentiment;
  confidence: number;
  key_points: string[];
  recommendation_to_salesperson: string;
}

export interface AnalysisResponse {
  room_id: string;
  analysis: Analysis | null;
}

export interface Message {
  text: string;
  speaker: "user" | "assistant";
  sent_ts: number;
  received_at: string;
  room_id: string;
}

export interface MessagesResponse {
  room_id: string;
  messages: Message[];
}

// Session/Call History interfaces
export interface CallSession {
  session_id: string;
  timestamp: string;
  total_messages: number;
  latest_analysis: Analysis | null;
  messages: Message[];
  user_email?: string;
}

export interface ConversationsResponse {
  sessions: Array<{
    room_id: string;
    count: number;
  }>;
}

/**
 * Fetch the latest sentiment analysis for a room
 */
export async function fetchLatestAnalysis(
  roomId: string
): Promise<AnalysisResponse> {
  const response = await fetchWithAuth(`/analysis/${roomId}`);
  return (await response.json()) as AnalysisResponse;
}

/**
 * Fetch recent messages for a room
 */
export async function fetchMessages(
  roomId: string,
  limit = 50
): Promise<MessagesResponse> {
  const response = await fetchWithAuth(`/messages/${roomId}?limit=${limit}`);
  return (await response.json()) as MessagesResponse;
}

/**
 * Fetch all conversations (call history) for logged-in user
 */
export async function fetchConversations(): Promise<ConversationsResponse> {
  const response = await fetchWithAuth('/conversations');
  return (await response.json()) as ConversationsResponse;
}

/**
 * Fetch a specific saved session by ID (with authentication)
 */
export async function fetchSession(sessionId: string): Promise<CallSession> {
  const response = await fetchWithAuth(`/session/${sessionId}`);
  return (await response.json()) as CallSession;
}

/**
 * ✅ NEW: Alias for fetchSession (for Dashboard compatibility)
 */
export async function fetchSessionDetails(sessionId: string): Promise<CallSession> {
  return fetchSession(sessionId);
}

/**
 * Save a session with user email (with authentication)
 */
export async function saveSession(roomId: string) {
  const user = JSON.parse(localStorage.getItem('nexus_user') || '{}');
  const response = await fetchWithAuth(
    `/save-session?room_id=${roomId}&user_email=${user.email}`,
    { method: 'POST' }
  );
  return await response.json();
}