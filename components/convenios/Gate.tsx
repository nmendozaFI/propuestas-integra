"use client";

// ═══════════════════════════════════════════════════════════════════════
// GATE DE CONTRASEÑA — área interna de convenios
// ═══════════════════════════════════════════════════════════════════════
// Reutilizable por las tres pantallas internas (/convenios, /convenios/[grupo],
// /convenios/[grupo]/[codigo]). Mismo mecanismo que el generador de propuestas:
// APP_PASSWORD guardada en localStorage, verificada contra /api/verificar.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { MARCA } from "@/lib/marca";

const PASSWORD_STORAGE_KEY = "integra_app_password";

export default function Gate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = localStorage.getItem(PASSWORD_STORAGE_KEY);
      if (!saved) {
        if (!cancelled) setAuthed(false);
        return;
      }
      try {
        const res = await fetch("/api/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: saved }),
        });
        if (cancelled) return;
        if (res.ok) setAuthed(true);
        else {
          localStorage.removeItem(PASSWORD_STORAGE_KEY);
          setAuthed(false);
        }
      } catch {
        if (!cancelled) setAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (res.ok) {
        localStorage.setItem(PASSWORD_STORAGE_KEY, passwordInput);
        setAuthed(true);
      } else setAuthError("Contraseña incorrecta");
    } catch {
      setAuthError("Error de conexión");
    } finally {
      setAuthLoading(false);
    }
  }

  if (authed === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "var(--font-cuerpo)",
        }}
      >
        <div className="spinner-ring" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="login-wrap">
        <form className="login-box" onSubmit={handleLogin}>
          <div className="login-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARCA.logoColor} alt="Fundación Íntegra" />
          </div>
          <h2>Generador de convenios</h2>
          <p className="login-sub">
            Introduce la contraseña del equipo de alianzas.
          </p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Contraseña"
            autoFocus
          />
          {authError && <div className="login-error">{authError}</div>}
          <button type="submit" disabled={authLoading || !passwordInput}>
            {authLoading ? "Verificando…" : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}

export function cerrarSesionConvenios() {
  localStorage.removeItem(PASSWORD_STORAGE_KEY);
  window.location.reload();
}
