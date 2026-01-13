// src/pages/LiveCall.tsx
import { useState, useEffect, useRef } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Loader2,
  Lightbulb,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getLiveKitToken } from "@/lib/livekit-service";
import { useToast } from "@/hooks/use-toast";
import {
  fetchLatestAnalysis,
  fetchMessages,
  Analysis,
  Message,
} from "@/lib/analysis-service";

type SentimentUi = {
  label: string;
  emoji: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
  pulseColor: string;
};

const SENTIMENT_UI: Record<string, SentimentUi> = {
  positive: {
    label: "Positive",
    emoji: "😊",
    badgeVariant: "default",
    pulseColor: "bg-green-500",
  },
  neutral: {
    label: "Neutral",
    emoji: "😐",
    badgeVariant: "secondary",
    pulseColor: "bg-blue-500",
  },
  negative: {
    label: "Negative",
    emoji: "😟",
    badgeVariant: "destructive",
    pulseColor: "bg-red-500",
  },
};

export default function LiveCall() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [roomName, setRoomName] = useState("");

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const roomRef = useRef<Room | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const { toast } = useToast();

  const startPolling = (roomId: string) => {
    const tick = async () => {
      try {
        const [a, m] = await Promise.allSettled([
          fetchLatestAnalysis(roomId),
          fetchMessages(roomId, 60),
        ]);

        if (a.status === "fulfilled") setAnalysis(a.value.analysis);
        if (m.status === "fulfilled") setMessages(m.value.messages);
      } catch (_) {}
    };
    tick();
    pollTimerRef.current = window.setInterval(tick, 1500);
  };

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setAnalysis(null);
    setMessages([]);
  };

  const connectToRoom = async () => {
    try {
      setIsConnecting(true);
      setStatus("Connecting...");

      const newRoomName = `room-${Date.now()}`;
      const participantName = `user-${Date.now()}`;
      setRoomName(newRoomName);

      // ✅ FIX: Get user email from localStorage
      const userEmail = JSON.parse(localStorage.getItem('nexus_user') || '{}').email;

      // ✅ FIX: Pass user email to getLiveKitToken
      const { token, url } = await getLiveKitToken(
        newRoomName,
        participantName,
        userEmail
      );

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach();
          audioElementRef.current = audioElement;
          document.body.appendChild(audioElement);
          audioElement
            .play()
            .catch((err) => console.error("Audio play error:", err));
        }
      });

      room.on(RoomEvent.Connected, () => {
        setIsConnected(true);
        setIsConnecting(false);
        setStatus("Connected");
        toast({
          title: "Connected!",
          description: "You're now connected to the AI assistant.",
        });
        startPolling(newRoomName);
      });

      room.on(RoomEvent.Disconnected, () => {
        setIsConnected(false);
        setIsConnecting(false);
        setStatus("Disconnected");
        toast({
          title: "Disconnected",
          description: "Call ended.",
          variant: "destructive",
        });
        stopPolling();
        
        // ✅ FIX: Include user email when saving session
        const userEmail = JSON.parse(localStorage.getItem('nexus_user') || '{}').email;
        fetch(`http://localhost:8000/save-session?room_id=${newRoomName}&user_email=${userEmail}`, {
          method: "POST",
        }).catch(() => {});
      });

      room.on(RoomEvent.Reconnecting, () => setStatus("Reconnecting..."));
      room.on(RoomEvent.Reconnected, () => setStatus("Connected"));

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (error) {
      console.error("Connection error:", error);
      setIsConnecting(false);
      setStatus("Connection failed");
      toast({
        title: "Connection Error",
        description:
          error instanceof Error ? error.message : "Failed to connect",
        variant: "destructive",
      });
    }
  };

  const disconnect = async () => {
    stopPolling();
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
      setIsConnected(false);
      setStatus("Disconnected");
      if (audioElementRef.current) {
        audioElementRef.current.remove();
        audioElementRef.current = null;
      }
    }
    if (roomName) {
      // ✅ FIX: Include user email when saving session
      const userEmail = JSON.parse(localStorage.getItem('nexus_user') || '{}').email;
      fetch(`http://localhost:8000/save-session?room_id=${roomName}&user_email=${userEmail}`, {
        method: "POST",
      }).catch(() => {});
    }
  };

  const toggleMute = async () => {
    if (roomRef.current && roomRef.current.localParticipant) {
      const enable = isMuted;
      await roomRef.current.localParticipant.setMicrophoneEnabled(enable);
      setIsMuted(!enable);
      toast({
        description: enable ? "Microphone unmuted" : "Microphone muted",
      });
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
      disconnect();
    };
  }, []);

  const sentimentKey = analysis?.sentiment ?? "neutral";
  const s = SENTIMENT_UI[sentimentKey] ?? SENTIMENT_UI["neutral"];

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Card className="shadow-lg">
        <CardHeader className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-3xl font-bold">
              AI Voice Assistant
            </CardTitle>
            <CardDescription className="text-lg">
              Talk to our AI assistant about Educational AI & ML Courses
            </CardDescription>
            {roomName && (
              <p className="text-xs text-muted-foreground mt-2">
                Room: {roomName}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <div
                className={`w-3 h-3 rounded-full ${s.pulseColor} animate-pulse`}
              />
              <div
                className={`absolute inset-0 ${s.pulseColor} opacity-40 blur-sm`}
              />
            </div>
            <Badge variant={s.badgeVariant} className="text-base">
              {s.emoji} {s.label}
              {analysis ? (
                <span className="ml-2 text-xs opacity-75">
                  ({Math.round((analysis.confidence || 0) * 100)}%)
                </span>
              ) : null}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-secondary/20 rounded-lg p-4 text-center">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Status
            </p>
            <div className="flex items-center justify-center gap-2">
              {isConnecting && <Loader2 className="animate-spin h-5 w-5" />}
              {isConnected && !isConnecting && (
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              )}
              <Badge
                variant={isConnected ? "default" : "secondary"}
                className="text-base"
              >
                {status}
              </Badge>
            </div>
          </div>

          <div className="flex gap-3">
            {!isConnected ? (
              <Button
                onClick={connectToRoom}
                disabled={isConnecting}
                className="flex-1 h-14 text-lg"
                size="lg"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Phone className="mr-2 h-5 w-5" />
                    Start Call
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  onClick={toggleMute}
                  variant={isMuted ? "destructive" : "default"}
                  className="flex-1 h-14 text-lg"
                  size="lg"
                >
                  {isMuted ? (
                    <>
                      <MicOff className="mr-2 h-5 w-5" />
                      Unmute
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-5 w-5" />
                      Mute
                    </>
                  )}
                </Button>
                <Button
                  onClick={disconnect}
                  variant="destructive"
                  className="flex-1 h-14 text-lg"
                  size="lg"
                >
                  <PhoneOff className="mr-2 h-5 w-5" />
                  End Call
                </Button>
              </>
            )}
          </div>

          {isConnected && (
            <Alert>
              <AlertDescription className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span>
                  {isMuted
                    ? "Microphone muted"
                    : "Microphone active - Speak now"}
                </span>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Live Transcript
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {messages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg ${
                        m.speaker === "assistant"
                          ? "bg-primary/10 ml-8"
                          : "bg-muted/30 mr-8"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-primary">
                          {m.speaker === "assistant" ? "Agent" : "You"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(m.sent_ts * 1000).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm">{m.text}</p>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Start talking to see the transcript here.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-primary" />
                  AI Suggestions
                </CardTitle>
                {analysis?.key_points?.length ? (
                  <CardDescription>
                    {analysis.key_points.slice(0, 3).join(" • ")}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis ? (
                  <>
                    <div className="p-4 rounded-lg bg-muted/30 border border-primary/10">
                      <p className="text-sm">
                        {analysis.recommendation_to_salesperson}
                      </p>
                    </div>
                    {analysis.key_points?.map((kp, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-muted/20 border"
                      >
                        <p className="text-sm">• {kp}</p>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Suggestions will appear as you speak.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Alert variant="default" className="bg-blue-50">
            <AlertDescription className="text-sm">
              <p className="font-semibold mb-2">Troubleshooting:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>
                  Ensure your agent is running:{" "}
                  <code className="bg-gray-200 px-1 rounded">
                    python agent.py dev
                  </code>
                </li>
                <li>
                  Backend:{" "}
                  <code className="bg-gray-200 px-1 rounded">
                    http://localhost:8000
                  </code>
                </li>
                <li>Check browser microphone permissions</li>
                <li>Make sure LiveKit server is running</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}