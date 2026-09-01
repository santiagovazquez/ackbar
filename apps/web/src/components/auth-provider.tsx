"use client";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import Image from "next/image";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type Auth = { token: string | null; isLoading: boolean; signOut: () => void };
type LocalUser = { id: string; name: string; email: string; token: string };
const AuthContext = createContext<Auth>({ token: null, isLoading: true, signOut: () => undefined });
export const useAuth = () => useContext(AuthContext);

function tokenExpiration(token: string) {
  if (token.startsWith("local-user:")) return Infinity;
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
  const [isLoading, setIsLoading] = useState(true);
  const [localUsers, setLocalUsers] = useState<LocalUser[] | null>(null);
  const loginMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const storedToken = sessionStorage.getItem("google_id_token");
    const expiration = storedToken ? tokenExpiration(storedToken) : null;
    if (storedToken && expiration && expiration > Date.now()) setToken(storedToken);
    else sessionStorage.removeItem("google_id_token");
    setIsLoading(false);
    api<LocalUser[]>("/users/local-auth")
      .then(setLocalUsers)
      .catch(() => setLocalUsers([]));
  }, []);
  const save = (value: string) => {
    sessionStorage.setItem("google_id_token", value);
    setToken(value);
  };
  const signOut = () => {
    sessionStorage.removeItem("google_id_token");
    setToken(null);
  };
  const selectLocalUser = (value: string) => {
    save(value);
    if (loginMenu.current) loginMenu.current.open = false;
  };
  const googleLoginSuccess = (credential?: string) => {
    if (!credential) return;
    save(credential);
    if (loginMenu.current) loginMenu.current.open = false;
  };
  useEffect(() => {
    if (!token) return;
    if (token.startsWith("local-user:")) return;
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
      <AuthContext.Provider value={{ token, isLoading, signOut }}>
        <header className="topbar">
          <a className="brand" href="/">
            <Image
              className="brand-logo"
              src="/its-a-deal-logo.jpg"
              alt="It's a Deal"
              width={792}
              height={422}
              priority
            />
          </a>
          <nav>
            {token && <a href="/vendo">Vendo</a>}
            {token && <a href="/dashboard">Mi panel</a>}
            {isLoading ? null : token ? (
              <button className="link" onClick={signOut}>
                Salir
              </button>
            ) : localUsers === null ? null : localUsers.length > 0 ? (
              <details className="local-login" ref={loginMenu}>
                <summary>Iniciar sesión</summary>
                <div className="local-login-popover">
                  <strong>Iniciar sesión</strong>
                  <GoogleLogin
                    onSuccess={(response) => googleLoginSuccess(response.credential)}
                    onError={() => undefined}
                    size="medium"
                  />
                  <div className="local-login-divider">
                    <span>o usar un usuario de testing</span>
                  </div>
                  <div className="local-login-users">
                    {localUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => selectLocalUser(user.token)}
                      >
                        <span>{user.name}</span>
                        <small>{user.email}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </details>
            ) : (
              <GoogleLogin
                onSuccess={(response) => googleLoginSuccess(response.credential)}
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
