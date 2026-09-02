"use client";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import Image from "next/image";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Notifications } from "./notifications";

type AuthUser = {
  id: string;
  name: string;
  avatarUrl: string | null;
  username: string | null;
  whatsapp: string | null;
};
type Auth = {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  signOut: () => void;
};
type LocalUser = { id: string; name: string; email: string; token: string };
const AuthContext = createContext<Auth>({
  token: null,
  user: null,
  isLoading: true,
  signOut: () => undefined,
});
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localUsers, setLocalUsers] = useState<LocalUser[] | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const loginMenu = useRef<HTMLDetailsElement>(null);
  const userMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    api<{ user: AuthUser }>("/users/me", { cache: "no-store" })
      .then((response) => {
        setUser(response.user);
        setToken("session");
      })
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
    api<LocalUser[]>("/users/local-auth")
      .then(setLocalUsers)
      .catch(() => setLocalUsers([]));
  }, []);
  const signOut = () => {
    setToken(null);
    setUser(null);
    void api("/users/session", { method: "DELETE", keepalive: true }).catch(() => undefined);
    if (userMenu.current) userMenu.current.open = false;
  };
  const selectLocalUser = async (value: string) => {
    await api("/users/session/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: value }),
    });
    const response = await api<{ user: AuthUser }>("/users/me", { cache: "no-store" });
    setUser(response.user);
    setToken("session");
    if (loginMenu.current) loginMenu.current.open = false;
  };
  const googleLoginSuccess = async (credential?: string) => {
    if (!credential) return;
    const response = await api<{ user: AuthUser }>("/users/session/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    setUser(response.user);
    setToken("session");
    if (loginMenu.current) loginMenu.current.open = false;
  };
  useEffect(() => {
    const closeUserMenu = (event: MouseEvent) => {
      if (userMenu.current?.open && !userMenu.current.contains(event.target as Node)) {
        userMenu.current.open = false;
      }
    };
    document.addEventListener("mousedown", closeUserMenu);
    return () => document.removeEventListener("mousedown", closeUserMenu);
  }, []);
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}>
      <AuthContext.Provider value={{ token, user, isLoading, signOut }}>
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
            {token && <a href="/busco">Busco</a>}
            {token && <Notifications />}
            {isLoading ? null : token ? (
              <details className="user-menu" ref={userMenu}>
                <summary aria-label="Abrir menú de usuario" title={user?.name ?? "Mi cuenta"}>
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span aria-hidden="true">
                      {user?.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                  )}
                </summary>
                <div className="user-menu-popover">
                  {user && <strong>{user.name}</strong>}
                  <a href="/dashboard" onClick={() => userMenu.current?.removeAttribute("open")}>
                    Mis publicaciones
                  </a>
                  <a href="/entregas" onClick={() => userMenu.current?.removeAttribute("open")}>
                    Entregas
                  </a>
                  <a href="/mis-claims" onClick={() => userMenu.current?.removeAttribute("open")}>
                    Mis claims
                  </a>
                  <hr />
                  <button type="button" onClick={signOut}>
                    Cerrar sesión
                  </button>
                </div>
              </details>
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
                        onClick={() => void selectLocalUser(user.token)}
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
          <Registration onComplete={setUser} />
        )}
        {children}
      </AuthContext.Provider>
    </GoogleOAuthProvider>
  );
}

function Registration({ onComplete }: { onComplete: (user: AuthUser) => void }) {
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
        headers: { "Content-Type": "application/json" },
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
              pattern="(?=(?:.*[a-z]){3})[a-z0-9\-]+"
              minLength={3}
              maxLength={30}
              placeholder="tu-nombre"
              required
              autoFocus
            />
          </div>
          <small>Al menos 3 letras. También puede contener números y guiones (-).</small>
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
