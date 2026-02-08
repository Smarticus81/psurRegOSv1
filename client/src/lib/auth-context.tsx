/**
 * Simplified Auth Context — no authentication required.
 *
 * Keeps the same API surface so consumers (navigation.tsx, home.tsx)
 * don't need changes.  `isAuthenticated` is always true;
 * `openAuthModal` / `closeAuthModal` / `login` / `signup` are no-ops.
 */
import { createContext, useContext, ReactNode } from "react";

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

const defaultUser: User = {
  id: "local-user",
  name: "Operator",
  email: "operator@local",
};

const noop = () => {};
const asyncNoop = async () => {};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: true,
  user: defaultUser,
  login: asyncNoop,
  signup: asyncNoop,
  logout: noop,
  openAuthModal: noop,
  closeAuthModal: noop,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: true,
        user: defaultUser,
        login: asyncNoop,
        signup: asyncNoop,
        logout: noop,
        openAuthModal: noop,
        closeAuthModal: noop,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
