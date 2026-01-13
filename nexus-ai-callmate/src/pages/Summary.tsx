import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, ThumbsUp, ThumbsDown, MessageSquare, FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/Navbar";
import { fetchSession, CallSession } from "@/lib/analysis-service";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const Summary = () => {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<CallSession | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { token } = useAuth();

  useEffect(() => {
    const loadSession = async () => {
      if (!id || !token) return;
      
      try {
        const data = await fetchSession(id);
        setSession(data);
      } catch (error) {
        console.error("Failed to load session:", error);
        toast({
          title: "Error",
          description: "Failed to load call summary",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadSession();
  }, [id, token, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <Card className="p-8 text-center">
            <p className="text-lg text-muted-foreground">Session not found</p>
            <Link to="/dashboard">
              <Button className="mt-4">Back to Dashboard</Button>
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  // Calculate call duration from messages
  const firstMsg = session.messages[0];
  const lastMsg = session.messages[session.messages.length - 1];
  const durationSeconds = lastMsg && firstMsg 
    ? Math.floor(lastMsg.sent_ts - firstMsg.sent_ts) 
    : 0;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  const duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Get sentiment info
  const sentiment = session.latest_analysis?.sentiment || "neutral";
  const sentimentEmoji = {
    positive: "😊",
    neutral: "😐",
    negative: "😟"
  }[sentiment];

  // Extract user messages for "what customer said"
  const userMessages = session.messages.filter(m => m.speaker === "user");
  
  // Key points from analysis
  const keyPoints = session.latest_analysis?.key_points || [];
  
  // Recommendation
  const recommendation = session.latest_analysis?.recommendation_to_salesperson || 
    "No specific recommendations available.";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="mb-6">
          <Link to="/dashboard">
            <Button variant="ghost" className="gap-2 mb-4">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
                Call Summary
              </h1>
              <p className="text-muted-foreground">
                Session: {session.session_id.slice(0, 20)}... • 
                {new Date(session.timestamp).toLocaleDateString()} • 
                Duration: {duration}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-base">
                {sentimentEmoji} {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
              </Badge>
              <Button variant="glass" className="gap-2">
                <Download className="w-4 h-4" />
                Export PDF
              </Button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Full Transcript */}
          <Card className="p-6 bg-card/40 backdrop-blur-md border-primary/20 animate-slide-in lg:col-span-2">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Full Transcript ({session.total_messages} messages)
            </h2>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {session.messages.map((msg, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg ${
                    msg.speaker === "assistant"
                      ? "bg-primary/10 ml-8"
                      : "bg-muted/30 mr-8"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-primary">
                      {msg.speaker === "assistant" ? "Agent" : "Customer"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.sent_ts * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm">{msg.text}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Key Points / What Customer Said */}
          <Card className="p-6 bg-card/40 backdrop-blur-md border-primary/20 animate-slide-in">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ThumbsUp className="w-5 h-5 text-green-400" />
              Key Points from Conversation
            </h2>

            <ul className="space-y-3">
              {keyPoints.length > 0 ? (
                keyPoints.map((point, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20"
                  >
                    <div className="w-2 h-2 rounded-full bg-green-400 mt-2" />
                    <span className="text-sm flex-1">{point}</span>
                  </li>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No key points identified</p>
              )}
            </ul>
          </Card>

          {/* Customer Messages Summary */}
          <Card className="p-6 bg-card/40 backdrop-blur-md border-primary/20 animate-slide-in" style={{ animationDelay: "100ms" }}>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
             {/* <ThumbsDown className="w-5 h-5 text-blue-400" />  */}
              Customer Said ({userMessages.length} messages)
            </h2>

            <ul className="space-y-3 max-h-64 overflow-y-auto">
              {userMessages.length > 0 ? (
                userMessages.slice(0, 5).map((msg, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20"
                  >
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-2" />
                    <span className="text-sm flex-1">{msg.text}</span>
                  </li>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No customer messages</p>
              )}
            </ul>
          </Card>

          {/* AI Feedback & Recommendations */}
          <Card className="p-6 bg-card/40 backdrop-blur-md border-primary/20 animate-slide-in lg:col-span-2" style={{ animationDelay: "200ms" }}>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              AI Feedback & Recommendations
            </h2>

            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 mb-4">
              <p className="text-sm leading-relaxed">{recommendation}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Sentiment Analysis</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {sentimentEmoji} {sentiment}
                  </Badge>
                  {session.latest_analysis && (
                    <span className="text-xs text-muted-foreground">
                      Confidence: {Math.round(session.latest_analysis.confidence * 100)}%
                    </span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Call Statistics</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Total Messages: {session.total_messages}</li>
                  <li>Duration: {duration}</li>
                  <li>Date: {new Date(session.timestamp).toLocaleString()}</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-sm font-medium mb-3">Next Steps</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Review the full transcript for context
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Follow up based on sentiment analysis
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Address key points mentioned by customer
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Summary;