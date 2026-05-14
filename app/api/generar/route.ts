import { NextRequest, NextResponse } from 'next/server';
import { TIPOS_PROPUESTA, type TipoPropuestaId } from '@/lib/tipos-propuesta';

// Ejecutar como Node runtime (no edge) — usamos fetch nativo, no SDK
export const runtime = 'nodejs';

type Body = {
  nombre: string;
  sector: string;
  tamano?: string;
  historial?: string;
  valores?: string;
  contexto?: string;
  lineas: string[];
  importe?: string;
  via?: string;
  tipo: TipoPropuestaId;
};

// ─── Retry con backoff exponencial para errores transitorios de Anthropic ───
// 529 = Overloaded, 503 = Service Unavailable, 502 = Bad Gateway
// 408 = Request Timeout, 429 = Rate Limit
const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 529]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callAnthropicWithRetry(
  apiKey: string,
  body: object,
): Promise<{ ok: true; data: { content?: Array<{ text?: string }> } } | { ok: false; status: number; error: string }> {
  let lastError = '';
  let lastStatus = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        return { ok: true, data };
      }

      lastStatus = res.status;
      const errText = await res.text();
      lastError = errText.slice(0, 300);

      // Solo reintentar si es un error transitorio Y aún quedan reintentos
      if (!RETRYABLE_STATUSES.has(res.status) || attempt === MAX_RETRIES) {
        return { ok: false, status: res.status, error: lastError };
      }

      // Backoff exponencial con jitter: 1s, 2s, 4s (+ hasta 500ms aleatorios)
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      await sleep(delay);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_RETRIES) {
        return { ok: false, status: 0, error: lastError };
      }
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }

  return { ok: false, status: lastStatus, error: lastError };
}

export async function POST(request: NextRequest) {
  // 1) Auth por contraseña compartida del equipo
  const auth = request.headers.get('x-app-password');
  if (auth !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // 2) Validar API key configurada en servidor
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Falta ANTHROPIC_API_KEY en el servidor' },
      { status: 500 },
    );
  }

  // 3) Parsear body
  let data: Body;
  try {
    data = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { nombre, sector, tamano, historial, valores, contexto, lineas, tipo } = data;
  if (!nombre || !sector) {
    return NextResponse.json(
      { error: 'Faltan campos obligatorios (nombre, sector)' },
      { status: 400 },
    );
  }

  // 4) Obtener config del tipo y construir prompt
  const tipoConfig = TIPOS_PROPUESTA[tipo] ?? TIPOS_PROPUESTA.general;
  const prompt = tipoConfig.buildPrompt({
    nombre,
    sector,
    tamano,
    historial,
    valores,
    contexto,
    lineas,
  });

  // 5) Llamar a Anthropic con retry para errores transitorios
  const result = await callAnthropicWithRetry(apiKey, {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  if (!result.ok) {
    // Mensaje user-friendly para errores transitorios que agotaron reintentos
    if (result.status === 529 || result.status === 503) {
      return NextResponse.json(
        {
          error: 'Los servidores de IA están saturados ahora mismo. Prueba de nuevo en unos minutos.',
        },
        { status: 503 },
      );
    }
    if (result.status === 429) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes seguidas. Espera un momento y prueba de nuevo.' },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: `Error de la IA (${result.status}): ${result.error}` },
      { status: 502 },
    );
  }

  // 6) Extraer texto de la respuesta
  const texto = (result.data.content ?? [])
    .map((b) => b.text ?? '')
    .join('')
    .trim();

  if (!texto) {
    return NextResponse.json({ error: 'La IA devolvió una respuesta vacía' }, { status: 502 });
  }

  return NextResponse.json({ texto });
}