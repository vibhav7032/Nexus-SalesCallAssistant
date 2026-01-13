import { useState, useEffect } from "react";
import { User, Mail, Building, Key, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Navbar from "@/components/Navbar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext"; // ✅ ADD THIS

const Profile = () => {
  const { toast } = useToast();
  const { user } = useAuth(); // ✅ ADD THIS
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    apiKey: "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
  });

  // ✅ LOAD USER DATA WHEN COMPONENT MOUNTS
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.name || "",
        email: user.email || "",
      }));
    }
  }, [user]);

  const handleSave = () => {
    toast({
      title: "Profile updated",
      description: "Your changes have been saved successfully.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-12 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            Profile Settings
          </h1>
          <p className="text-muted-foreground">
            Manage your account information and preferences
          </p>
        </div>

        <div className="space-y-6">
          {/* Personal Information */}
          <Card className="p-6 bg-card/40 backdrop-blur-md border-primary/20 animate-slide-in">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Personal Information
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4" />
                  User Name
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-input/50 border-border focus:border-primary/50"
                />
              </div>
              
              <div>
                <Label htmlFor="email" className="flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-input/50 border-border focus:border-primary/50"
                  disabled // ✅ EMAIL SHOULD NOT BE EDITABLE
                />
              </div>
              
              <div>
                <Label htmlFor="company" className="flex items-center gap-2 mb-2">
                  <Building className="w-4 h-4" />
                  Company
                </Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="bg-input/50 border-border focus:border-primary/50"
                  placeholder="Enter your company name (optional)"
                />
              </div>
            </div>
          </Card>

          {/* API Key Management */}
          <Card className="p-6 bg-card/40 backdrop-blur-md border-primary/20 animate-slide-in" style={{ animationDelay: "100ms" }}>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              API Key Management
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="apiKey" className="flex items-center gap-2 mb-2">
                  API Key
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="apiKey"
                    type="password"
                    value={formData.apiKey}
                    readOnly
                    className="bg-input/50 border-border font-mono text-sm"
                  />
                  <Button variant="outline">
                    Regenerate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Keep your API key secure. Never share it publicly.
                </p>
              </div>
            </div>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} className="gap-2" size="lg">
              <Save className="w-4 h-4" />
              Save Changes
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;