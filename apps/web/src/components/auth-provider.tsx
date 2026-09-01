"use client";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import Image from "next/image";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type AuthUser = { name: string; username: string | null; whatsapp: string | null };
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
  const [user, setUser] = useState<AuthUser | null>(null);
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
    setUser(null);
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
  useEffect(() => {
    if (!token) return;
    api<{ user: AuthUser }>("/users/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((response) => setUser(response.user))
      .catch(signOut);
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
        {token && user && (!user.username || !user.whatsapp) && (
          <Registration token={token} onComplete={setUser} />
        )}
        {children}
      </AuthContext.Provider>
    </GoogleOAuthProvider>
  );
}

function Registration({
  token,
  onComplete,
}: {
  token: string;
  onComplete: (user: AuthUser) => void;
}) {
  const [username, setUsername] = useState("");
  const [whatsapp, setWhatsapp] = useState("+54");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api<{ user: AuthUser }>("/users/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username, whatsapp }),
      });
      onComplete(response.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos completar el registro.");
      setBusy(false);
    }
  }
  return (
    <div className="registration-backdrop" role="presentation">
      <section
        className="registration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-title"
      >
        <h1 id="registration-title">Completá tu registro</h1>
        <p>Elegí cómo te van a encontrar y dónde podrán contactarte después de un claim.</p>
        <form onSubmit={submit}>
          <label htmlFor="registration-username">Nombre de usuario</label>
          <div className="username-field">
            <span>ackb.ar/</span>
            <input
              id="registration-username"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              autoComplete="username"
              pattern="[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?"
              minLength={3}
              maxLength={30}
              placeholder="tu_nombre"
              required
              autoFocus
            />
          </div>
          <small>Entre 3 y 30 caracteres: letras minúsculas, números, guion o guion bajo.</small>
          <label htmlFor="registration-whatsapp">WhatsApp</label>
          <input
            id="registration-whatsapp"
            type="tel"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value.replace(/[\s()-]/g, ""))}
            autoComplete="tel"
            placeholder="+5491123456789"
            required
          />
          <small>Sólo lo compartiremos con la otra persona cuando haya un claim.</small>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Crear mi perfil"}
          </button>
        </form>
      </section>
    </div>
  );
}
