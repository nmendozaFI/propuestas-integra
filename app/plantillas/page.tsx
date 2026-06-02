'use client';

import { useEffect, useState } from 'react';
import { saveAs } from 'file-saver';
import {
  plantillasPorGrupo,
  type PlantillaRegistro,
} from '@/lib/plantillas-registro';
import { validarSubida, type ResultadoValidacion } from '@/lib/plantillas-validacion';
import {
  cargarManifest,
  invalidarManifest,
  cargarPlantillaBytes,
} from '@/lib/plantillas-cliente';
import type { Manifest, EntradaManifest, VersionPlantilla } from '@/lib/plantillas-tipos';

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
const fmtKB = (b: number) => `${Math.max(1, Math.round(b / 1024))} KB`;

function versionViva(entrada?: EntradaManifest): VersionPlantilla | null {
  if (!entrada || !entrada.actual) return null;
  return entrada.versiones.find((v) => v.v === entrada.actual) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
// Gate propio con APP_ADMIN_PASSWORD. NO se persiste: se pide en cada visita
// (al desmontar/remontar la página vuelve a pedirse). La contraseña vive solo
// en estado de React y se usa para autorizar las llamadas del almacén.
// ═══════════════════════════════════════════════════════════════════════
export default function Almacen() {
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [cargando, setCargando] = useState(false);

  async function refrescar(pwd: string) {
    setCargando(true);
    const m = await cargarManifest(true, pwd);
    setManifest(m);
    setCargando(false);
  }
  useEffect(() => {
    if (adminAuthed) refrescar(adminPassword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminAuthed]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch('/api/verificar-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (res.ok) {
        setAdminPassword(passwordInput);
        setAdminAuthed(true);
        setPasswordInput('');
      } else setAuthError('Contraseña incorrecta');
    } catch {
      setAuthError('Error de conexión');
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    setAdminAuthed(false);
    setAdminPassword('');
    setManifest(null);
  }

  // ── Render: gate de administración (siempre al entrar) ──
  if (!adminAuthed) {
    return (
      <div className="login-wrap">
        <form className="login-box" onSubmit={handleLogin}>
          <div className="login-logo">
            <div className="icon-box">
              <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" /></svg>
            </div>
            <span>Fundación Íntegra</span>
          </div>
          <h2>Almacén de plantillas</h2>
          <p className="login-sub">Acceso de administración. Se pide en cada visita.</p>
          <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="Contraseña de administración" autoFocus />
          {authError && <div className="login-error">{authError}</div>}
          <button type="submit" disabled={authLoading || !passwordInput}>{authLoading ? 'Verificando…' : 'Entrar'}</button>
        </form>
      </div>
    );
  }

  const grupos = plantillasPorGrupo();

  // ── Render: app ──
  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <div className="sidebar-logo">
            <div className="icon-box">
              <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" /></svg>
            </div>
            <span>Fundación<br />Íntegra</span>
          </div>
          <h2 style={{ marginTop: '2rem' }}>Almacén de plantillas</h2>
          <p style={{ marginTop: '.75rem' }}>
            Descarga una plantilla, edita su formato en Word y vuelve a subirla. Desde ese
            momento los generadores usarán tu versión, sin tocar código.
          </p>
        </div>

        <div>
          <p className="step-label">Importante</p>
          <div className="step-list">
            <div className="step">
              <div className="step-num">1</div>
              <div className="step-text">No borres ni reescribas los <strong>{'{{PLACEHOLDERS}}'}</strong>.</div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div className="step-text">Al subir se <strong>validan automáticamente</strong>; si rompes alguno, se rechaza.</div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div className="step-text">Puedes <strong>volver a una versión anterior</strong> cuando quieras.</div>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>Salir del almacén</button>
          <p>Equipo de Alianzas · Fundación Íntegra</p>
        </div>
      </aside>

      <main className="main">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, opacity: 0.7 }}>
            {cargando ? 'Cargando estado…' : `${grupos.reduce((n, g) => n + g.items.length, 0)} plantillas`}
          </div>
          <button onClick={() => refrescar(adminPassword)} style={botonSecundario} disabled={cargando}>Actualizar</button>
        </div>

        {grupos.map(({ grupo, items }) => (
          <div key={grupo}>
            <div className="section-head">
              <div className="dot" />
              <h3>{grupo}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 26 }}>
              {items.map((reg) => (
                <FilaPlantilla
                  key={reg.plantillaId}
                  reg={reg}
                  entrada={manifest?.plantillas[reg.plantillaId]}
                  adminPassword={adminPassword}
                  onCambio={() => refrescar(adminPassword)}
                />
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUBCOMPONENTE: una plantilla
// ═══════════════════════════════════════════════════════════════════════
function FilaPlantilla({
  reg,
  entrada,
  adminPassword,
  onCambio,
}: {
  reg: PlantillaRegistro;
  entrada?: EntradaManifest;
  adminPassword: string;
  onCambio: () => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [validando, setValidando] = useState(false);
  const [validacion, setValidacion] = useState<ResultadoValidacion | null>(null);
  const [nota, setNota] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string; ajuste?: string[] } | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [trabajando, setTrabajando] = useState(false); // descarga / rollback

  const viva = versionViva(entrada);
  const inputId = `f-${reg.flatId}`;

  function reset() {
    setArchivo(null);
    setValidacion(null);
    setNota('');
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (el) el.value = '';
  }

  async function descargar() {
    setTrabajando(true);
    setMensaje(null);
    try {
      const bytes = await cargarPlantillaBytes(reg.rutaBundled, adminPassword);
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      saveAs(blob, `${reg.codigo}_${viva ? viva.v : 'original'}.docx`);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : String(err) });
    } finally {
      setTrabajando(false);
    }
  }

  async function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setMensaje(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.docx')) {
      setMensaje({ tipo: 'error', texto: 'El archivo debe ser un .docx' });
      e.target.value = '';
      return;
    }
    setArchivo(f);
    setValidando(true);
    setValidacion(null);
    try {
      // Baseline = versión viva actual (lo mismo que validará el servidor).
      const baselineBytes = await cargarPlantillaBytes(reg.rutaBundled, adminPassword);
      const nuevoBytes = new Uint8Array(await f.arrayBuffer());
      const res = await validarSubida({ nuevoBytes, baselineBytes });
      setValidacion(res);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: `No se pudo validar: ${err instanceof Error ? err.message : String(err)}` });
      reset();
    } finally {
      setValidando(false);
    }
  }

  async function confirmarSubida() {
    if (!archivo) return;
    setSubiendo(true);
    setMensaje(null);
    try {
      const fd = new FormData();
      fd.append('password', adminPassword);
      fd.append('plantillaId', reg.plantillaId);
      fd.append('nota', nota);
      fd.append('archivo', archivo);
      const res = await fetch('/api/plantillas/subir', { method: 'POST', body: fd });
      const data = (await res.json()) as {
        ok: boolean; version?: string; errores?: string[]; requiereAjusteForm?: string[]; error?: string;
      };
      if (!res.ok || !data.ok) {
        const txt = data.errores?.length ? data.errores.join(' · ') : data.error || `HTTP ${res.status}`;
        setMensaje({ tipo: 'error', texto: txt });
        return;
      }
      setMensaje({
        tipo: 'ok',
        texto: `Subida correcta (${data.version}). Ya es la versión viva.`,
        ajuste: data.requiereAjusteForm?.length ? data.requiereAjusteForm : undefined,
      });
      reset();
      invalidarManifest();
      onCambio();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubiendo(false);
    }
  }

  async function restaurar(v: string | null) {
    setTrabajando(true);
    setMensaje(null);
    try {
      const res = await fetch('/api/plantillas/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, plantillaId: reg.plantillaId, v }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMensaje({ tipo: 'error', texto: data.error || `HTTP ${res.status}` });
        return;
      }
      setMensaje({ tipo: 'ok', texto: v ? `Restaurada la versión ${v}.` : 'Restaurada la versión original.' });
      invalidarManifest();
      onCambio();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : String(err) });
    } finally {
      setTrabajando(false);
    }
  }

  const versiones = entrada?.versiones ?? [];
  const tieneOverride = !!entrada?.actual;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, opacity: 0.55 }}>{reg.codigo}</span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{reg.label}</span>
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
            {viva
              ? <>En uso: <strong>{viva.v}</strong> · {fmtFecha(viva.fecha)} · {fmtKB(viva.bytes)}{viva.nota ? ` · “${viva.nota}”` : ''}</>
              : <>Original (sin cambios)</>}
          </div>
          {viva && viva.requiereAjusteForm.length > 0 && (
            <div style={insigniaAjuste}>
              ⚠ Requiere ajuste de formulario: {viva.requiereAjusteForm.join(', ')} — avisar al responsable de la app.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={descargar} style={botonSecundario} disabled={trabajando}>Descargar</button>
          <label htmlFor={inputId} style={{ ...botonSecundario, cursor: 'pointer' }}>Subir nueva versión</label>
          <input id={inputId} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: 'none' }} onChange={elegirArchivo} />
          {versiones.length > 0 && (
            <button onClick={() => setVerHistorial((v) => !v)} style={botonSecundario}>
              Historial ({versiones.length})
            </button>
          )}
        </div>
      </div>

      {/* Validación del archivo elegido */}
      {archivo && (
        <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Archivo seleccionado: <strong>{archivo.name}</strong> ({fmtKB(archivo.size)})
            <button onClick={reset} style={{ ...enlace, marginLeft: 10 }}>quitar</button>
          </div>

          {validando && <div style={{ fontSize: 13, opacity: 0.7 }}>Validando placeholders…</div>}

          {validacion && validacion.errores.length > 0 && (
            <div style={cajaError}>
              <strong>No se puede subir — corrige esto:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {validacion.errores.map((e, i) => <li key={i} style={{ marginBottom: 4 }}>{e}</li>)}
              </ul>
            </div>
          )}

          {validacion && validacion.avisos.length > 0 && (
            <div style={cajaAviso}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {validacion.avisos.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
              </ul>
            </div>
          )}

          {validacion && validacion.ok && (
            <div style={{ marginTop: 12 }}>
              {validacion.errores.length === 0 && validacion.avisos.length === 0 && (
                <div style={{ ...cajaOk, marginBottom: 12 }}>Todos los placeholders correctos.</div>
              )}
              <div className="field" style={{ margin: '0 0 12px' }}>
                <label>Nota (opcional · queda en el historial)</label>
                <input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: ajuste de márgenes y logo · María" />
              </div>
              <button className="btn-generate" onClick={confirmarSubida} disabled={subiendo} style={{ width: 'auto' }}>
                {subiendo ? 'Subiendo…' : 'Confirmar y poner en uso'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mensajes */}
      {mensaje && (
        <div style={{ ...(mensaje.tipo === 'ok' ? cajaOk : cajaError), marginTop: 12 }}>
          {mensaje.texto}
          {mensaje.ajuste && (
            <div style={{ marginTop: 6 }}>
              ⚠ Placeholders nuevos sin campo en el formulario: <strong>{mensaje.ajuste.join(', ')}</strong>.
              No se rellenarán hasta ajustar la app — avisa al responsable.
            </div>
          )}
        </div>
      )}

      {/* Historial */}
      {verHistorial && versiones.length > 0 && (
        <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...versiones].reverse().map((v) => {
              const enUso = entrada?.actual === v.v;
              return (
                <div key={v.v} style={filaHistorial}>
                  <div style={{ fontSize: 13 }}>
                    <strong>{v.v}</strong> · {fmtFecha(v.fecha)} · {fmtKB(v.bytes)}
                    {v.nota ? ` · “${v.nota}”` : ''}
                    {v.requiereAjusteForm.length > 0 && <span style={{ color: '#b8860b' }}> · ⚠ {v.requiereAjusteForm.join(', ')}</span>}
                  </div>
                  {enUso
                    ? <span style={{ fontSize: 12, fontWeight: 700, color: '#2e7d32' }}>En uso</span>
                    : <button onClick={() => restaurar(v.v)} style={botonSecundario} disabled={trabajando}>Restaurar</button>}
                </div>
              );
            })}
            {tieneOverride && (
              <div style={filaHistorial}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Original empaquetada (sin cambios)</div>
                <button onClick={() => restaurar(null)} style={botonSecundario} disabled={trabajando}>Volver al original</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Estilos inline (en línea con migaStyle/tarjeta* del resto de la app) ───
const botonSecundario: React.CSSProperties = {
  background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: '8px 14px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#1a1a1a',
};
const enlace: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: '#C73E3A', cursor: 'pointer',
  fontSize: 13, fontFamily: 'inherit', textDecoration: 'underline',
};
const insigniaAjuste: React.CSSProperties = {
  marginTop: 8, fontSize: 12.5, background: '#fff8e1', border: '1px solid #ffe082',
  color: '#7a5c00', borderRadius: 8, padding: '6px 10px',
};
const cajaError: React.CSSProperties = {
  fontSize: 13, background: '#fdecea', border: '1px solid #f5c6c0', color: '#9b2c22',
  borderRadius: 8, padding: '10px 12px',
};
const cajaAviso: React.CSSProperties = {
  fontSize: 13, background: '#fff8e1', border: '1px solid #ffe082', color: '#7a5c00',
  borderRadius: 8, padding: '10px 12px', marginTop: 10,
};
const cajaOk: React.CSSProperties = {
  fontSize: 13, background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#2e7d32',
  borderRadius: 8, padding: '10px 12px',
};
const filaHistorial: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: '8px 12px',
};