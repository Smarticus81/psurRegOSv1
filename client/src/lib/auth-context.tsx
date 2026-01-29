import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Shield, Mail, Lock, User, ArrowRight, Sparkles } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  // Form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    // Simulate API call - replace with real auth later
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Demo auth - accept any email/password
    if (email && password) {
      const demoUser: User = {
        id: "demo-user-1",
        name: email.split("@")[0],
        email: email,
      };
      setUser(demoUser);
      setIsAuthenticated(true);
      setIsModalOpen(false);
      // Store in localStorage for persistence
      localStorage.setItem("smarticus_user", JSON.stringify(demoUser));
    } else {
      setError("Please enter email and password");
    }
    
    setIsLoading(false);
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (name && email && password) {
      const newUser: User = {
        id: "new-user-" + Date.now(),
        name: name,
        email: email,
      };
      setUser(newUser);
      setIsAuthenticated(true);
      setIsModalOpen(false);
      localStorage.setItem("smarticus_user", JSON.stringify(newUser));
    } else {
      setError("Please fill in all fields");
    }
    
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem("smarticus_user");
  }, []);

  const openAuthModal = useCallback(() => {
    setIsModalOpen(true);
    setError(null);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsModalOpen(false);
    setError(null);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(loginEmail, loginPassword);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    await signup(signupName, signupEmail, signupPassword);
  };

  // Check for existing session on mount
  useState(() => {
    const storedUser = localStorage.getItem("smarticus_user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        setIsAuthenticated(true);
      } catch (e) {
        localStorage.removeItem("smarticus_user");
      }
    }
  });

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        login,
        signup,
        logout,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}

      {/* Auth Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          <div className="p-6 pb-4 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Welcome to Smarticus</DialogTitle>
                  <DialogDescription>
                    Access the full regulatory intelligence platform
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "signin" | "signup")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-none border-b bg-transparent h-12">
              <TabsTrigger value="signin" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
                Sign In
              </TabsTrigger>
              <TabsTrigger value="signup" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
                Create Account
              </TabsTrigger>
            </TabsList>

            <div className="p-6">
              <TabsContent value="signin" className="mt-0 space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@company.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button type="submit" className="w-full h-11 rounded-lg" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Sign In
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Demo Mode</span>
                  </div>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Enter any email and password to access demo features.
                  Full authentication coming soon.
                </p>
              </TabsContent>

              <TabsContent value="signup" className="mt-0 space-y-4">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="name"
                        placeholder="John Smith"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Work Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@company.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="Create a password"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button type="submit" className="w-full h-11 rounded-lg" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Create Account
                      </>
                    )}
                  </Button>
                </form>

                <p className="text-xs text-center text-muted-foreground">
                  By creating an account, you agree to our Terms of Service
                  and Privacy Policy.
                </p>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </AuthContext.Provider>
  );
}
