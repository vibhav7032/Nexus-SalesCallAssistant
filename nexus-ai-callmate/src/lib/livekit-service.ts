// src/lib/livekit-service.ts

export interface TokenResponse {
  token: string;
  url: string;
  room: string;
}

export const getLiveKitToken = async (
  roomName: string,
  participantName: string,
  userEmail?: string  // ✅ ADD: Optional user email parameter
): Promise<TokenResponse> => {
  const response = await fetch('http://localhost:8000/get-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      room_name: roomName,
      participant_name: participantName,
      user_email: userEmail,  // ✅ ADD: Send user email to backend
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get token: ${response.statusText}`);
  }

  return response.json();
};