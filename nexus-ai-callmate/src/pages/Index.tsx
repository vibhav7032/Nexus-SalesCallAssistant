import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Phone, Brain, TrendingUp, Shield } from "lucide-react";

const Index = () => {
  const features = [
    {
      icon: Brain,
      title: "AI-Powered Intelligence",
      description: "Real-time sentiment analysis and smart suggestions during calls",
    },
    {
      icon: Phone,
      title: "Live Call Assistance",
      description: "Get instant recommendations and objection handling tips",
    },
    {
      icon: TrendingUp,
      title: "Performance Analytics",
      description: "Track success rates and improve your sales approach",
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-level encryption for all your customer data",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(220_90%_56%/0.15),transparent_70%)]" />
        
        <div className="container mx-auto px-4 pt-32 pb-24 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="flex justify-center mb-8">
              <div className="relative">
                {/* ✅ CHANGED: Use custom logo instead of Zap icon */}
                <img 
                  src="/logo.png" 
                  alt="Nexus Logo" 
                  className="w-20 h-20 object-contain animate-pulse-glow"
                />
                <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-full" />
              </div>
            </div>
            
            <h1 className="text-6xl md:text-7xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent animate-slide-in">
              Nexus
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 animate-slide-in" style={{ animationDelay: "100ms" }}>
              Your AI-Powered Sales Call Assistant
            </p>
            
            <p className="text-lg text-muted-foreground/80 mb-12 max-w-2xl mx-auto animate-slide-in" style={{ animationDelay: "200ms" }}>
              Transform every sales call with real-time emotion detection, intelligent suggestions, 
              and automated summaries. Close more deals with confidence.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-in" style={{ animationDelay: "300ms" }}>
              <Link to="/auth">
                <Button size="lg" className="gap-2 text-lg px-8">
                  Get Started
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="glass" size="lg" className="gap-2 text-lg px-8">
                  View Demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            Powerful Features
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Everything you need to supercharge your sales performance
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="p-6 rounded-xl bg-card/40 backdrop-blur-md border border-primary/20 hover:border-primary/40 transition-all duration-300 hover:shadow-glow animate-slide-in group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="p-3 rounded-lg bg-primary/10 w-fit mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-24">
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-primary opacity-10" />
          <div className="relative p-12 text-center">
            <h2 className="text-4xl font-bold mb-4">
              Ready to Transform Your Sales?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              Join thousands of sales professionals using Nexus to close more deals
            </p>
            <Link to="/auth">
              <Button size="lg" className="gap-2 text-lg px-8">
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;