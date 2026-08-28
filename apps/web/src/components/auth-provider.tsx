"use client";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { createContext, useContext, useEffect, useState } from "react";

type Auth = { token: string | null; signOut: () => void };
const AuthContext = createContext<Auth>({ token: null, signOut: () => undefined });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(sessionStorage.getItem("google_id_token")), []);
  const save = (value: string) => {
    sessionStorage.setItem("google_id_token", value);
    setToken(value);
  };
  const signOut = () => {
    sessionStorage.removeItem("google_id_token");
    setToken(null);
  };
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}>
      <AuthContext.Provider value={{ token, signOut }}>
        <header className="topbar">
          <a className="brand" href="/">
            SWU compraventa
          </a>
          <nav>
            <a href="/vendo">Vendo</a>
            <a href="/busco">Busco</a>
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
