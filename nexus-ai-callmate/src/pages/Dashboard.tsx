import { useEffect, useState } from "react";
import { Phone, TrendingUp, Users, Star, Activity, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { fetchConversations, fetchSessionDetails } from "@/lib/analysis-service";

interface Session {
  room_id: string;
  count: number;
}

interface ConversationsResponse {
  sessions: Session[];
}

interface SessionAnalysis {
  sentiment?: string;
  confidence?: number;
}

interface Stats {
  totalCalls: number;
  successRate: string;
  avgConfidence: string;
  positiveCount: number;
  avgCallLength: string;
}

const Dashboard = () => {
  const [conversations, setConversations] = useState<ConversationsResponse | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalCalls: 0,
    successRate: "0%",
    avgConfidence: "0.0",
    positiveCount: 0,
    avgCallLength: "0",
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { token } = useAuth();

  useEffect(() => {
    const loadConversations = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await fetchConversations();
        setConversations(data);

        // ✅ Calculate real stats from session data
        if (data.sessions && data.sessions.length > 0) {
          await calculateStats(data.sessions);
        }
      } catch (error) {
        console.error("Failed to load conversations:", error);
        toast({
          title: "Error",
          description: "Failed to load call history",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadConversations();
  }, [token]);

  // ✅ Calculate real statistics from session data
  const calculateStats = async (sessions: Session[]) => {
    try {
      let positiveCount = 0;
      let totalConfidence = 0;
      let totalMessages = 0;
      let analyzedCount = 0;

      // Fetch analysis for each session (limit to recent 10 to avoid too many requests)
      const recentSessions = sessions.slice(0, 10);
      
      for (const session of recentSessions) {
        try {
          const sessionData = await fetchSessionDetails(session.room_id);
          
          // ✅ Count total messages for avg call length
          totalMessages += session.count;
          
          if (sessionData?.latest_analysis) {
            const analysis = sessionData.latest_analysis as SessionAnalysis;
            analyzedCount++;

            // Count positive sentiments
            if (analysis.sentiment === "positive") {
              positiveCount++;
            }

            // Sum confidence scores
            if (typeof analysis.confidence === "number") {
              totalConfidence += analysis.confidence;
            }
          }
        } catch (error) {
          console.error(`Failed to fetch session ${session.room_id}:`, error);
          // Continue with other sessions even if one fails
        }
      }

      // Calculate success rate (percentage of positive sentiments)
      const successRate = analyzedCount > 0 
        ? Math.round((positiveCount / analyzedCount) * 100) 
        : 0;

      // Calculate average confidence as percentage
const avgConfidence = analyzedCount > 0 
  ? Math.round((totalConfidence / analyzedCount) * 100) 
  : 0;

      // ✅ Calculate average call length (messages per call)
      const avgCallLength = recentSessions.length > 0
        ? Math.round(totalMessages / recentSessions.length)
        : 0;

      setStats({
  totalCalls: sessions.length,
  successRate: `${successRate}%`,
  avgConfidence: `${avgConfidence}%`,  // ✅ Add % here
  positiveCount: positiveCount,
  avgCallLength: avgCallLength.toString(),
});

    } catch (error) {
      console.error("Error calculating stats:", error);
      // Keep default stats if calculation fails
    }
  };

  const displayStats = [
    {
      label: "Total Calls",
      value: stats.totalCalls.toString(),
      icon: Phone,
      trend: conversations && conversations.sessions.length > 0 ? "+12%" : "—"
    },
    {
      label: "Success Rate",
      value: stats.successRate,
      icon: TrendingUp,
      trend: stats.positiveCount > 0 ? `${stats.positiveCount} positive` : "—"
    },
    {
  label: "Avg Confidence",
  value: stats.avgConfidence,  // Will show like "85%"
  icon: Star,
  trend: parseInt(stats.avgConfidence) > 70 ? "High" : parseInt(stats.avgConfidence) > 50 ? "Medium" : "Low"
},
    {
      label: "Avg Call Length",
      value: stats.avgCallLength,
      icon: MessageSquare,
      trend: `messages/call`
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-muted-foreground">
              Overview of your sales performance and recent calls
            </p>
          </div>
          <Link to="/live-call">
            <Button size="lg" className="gap-2">
              <Activity className="w-5 h-5" />
              Start Call
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {displayStats.map((stat, index) => (
            <Card
              key={stat.label}
              className="p-6 bg-card/40 backdrop-blur-md border-primary/20 hover:border-primary/40 transition-all duration-300 hover:shadow-glow animate-slide-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <stat.icon className="w-6 h-6 text-primary" />
                </div>
                <span className="text-sm text-green-400 font-medium">{stat.trend}</span>
              </div>
              <p className="text-3xl font-bold mb-1">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </Card>
          ))}
        </div>

        {/* Recent Calls */}
        <Card className="p-6 bg-card/40 backdrop-blur-md border-primary/20">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Phone className="w-6 h-6 text-primary" />
            Your Recent Calls
          </h2>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading call history...
            </div>
          ) : conversations && conversations.sessions.length > 0 ? (
            <div className="space-y-4">
              {conversations.sessions.map((session, index) => (
                <div
                  key={session.room_id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-all duration-300 border border-transparent hover:border-primary/20 animate-slide-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <Phone className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Call Session</p>
                      <p className="text-sm text-muted-foreground">
                        {session.count} messages
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Activity className="w-4 h-4" />
                      Room: {session.room_id.slice(0, 10)}...
                    </span>
                    <Link to={`/summary/${session.room_id}`}>
                      <Button variant="ghost" size="sm">
                        View Summary
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No calls yet. Start your first call to see history here!
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;