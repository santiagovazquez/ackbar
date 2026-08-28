"use client";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { createContext, useContext, useEffect, useState } from "react";

type Auth = { token: string | null; signOut: () => void };
const AuthContext = createContext<Auth>({ token: null, signOut: () => undefined });
export const useAuth = () => useContext(AuthContext);

function tokenExpiration(token: string) {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return null;
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
    };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const storedToken = sessionStorage.getItem("google_id_token");
    const expiration = storedToken ? tokenExpiration(storedToken) : null;
    if (storedToken && expiration && expiration > Date.now()) setToken(storedToken);
    else sessionStorage.removeItem("google_id_token");
  }, []);
  const save = (value: string) => {
    sessionStorage.setItem("google_id_token", value);
    setToken(value);
  };
  const signOut = () => {
    sessionStorage.removeItem("google_id_token");
    setToken(null);
  };
  useEffect(() => {
    if (!token) return;
    const expiration = tokenExpiration(token);
    if (!expiration) {
      signOut();
      return;
    }
    const remaining = expiration - Date.now();
    if (remaining <= 0) {
      signOut();
      return;
    }
    const timeout = window.setTimeout(signOut, remaining);
    return () => window.clearTimeout(timeout);
  }, [token]);
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}>
      <AuthContext.Provider value={{ token, signOut }}>
        <header className="topbar">
          <a className="brand" href="/">
            SWU compraventa
          </a>
          <nav>
            <a href="/vendo">Vendo</a>
            <a href="/dashboard">Mi panel</a>
            {token ? (
              <button className="link" onClick={signOut}>
                Salir
              </button>
            ) : (
              <GoogleLogin
                onSuccess={(response) => response.credential && save(response.credential)}
                onError={() => undefined}
                size="medium"
              />
            )}
          </nav>
        </header>
        {children}
      </AuthContext.Provider>
    </GoogleOAuthProvider>
  );
}
