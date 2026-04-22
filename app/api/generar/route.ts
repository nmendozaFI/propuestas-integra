import { NextRequest, NextResponse } from 'next/server';

// Ejecutar como Node runtime (no edge) porque usamos el SDK de Anthropic
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
  tipo: 'socios' | 'lgd' | 'general';
};

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
      { status: 500 }
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
      { status: 400 }
    );
  }

  // 4) Construir el prompt diferenciado según tipo
  const promptsPorTipo: Record<'socios' | 'lgd' | 'general', string> = {
    socios: `Eres el equipo de alianzas de Fundación Íntegra, fundación española de inserción laboral de personas vulnerables. Redactas una PROPUESTA ESTRATÉGICA para que ${nombre} se convierta en socio de la Red Compromiso Íntegra 2026 — una red de empresas referentes que apuestan por el empleo socialmente responsable como parte de su estrategia ESG.

DATOS EMPRESA:
- Nombre: ${nombre}
- Sector: ${sector}
${tamano ? `- Tamaño: ${tamano}` : ''}
${historial ? `- Historial con Íntegra: ${historial}` : ''}
${valores ? `- Valores RSC: ${valores}` : ''}
${contexto ? `- Contexto: ${contexto}` : ''}
LÍNEAS A DESTACAR: ${lineas.join(', ') || 'colaboración general'}

ENFOQUE ESTRATÉGICO (ESG avanzado + red de pares):
- Tono de alianza de largo plazo, no de proveedor-cliente. Hablamos entre iguales.
- Vocabulario estratégico: "alianza", "compromiso de largo plazo", "posicionamiento ESG", "capital reputacional", "liderazgo sectorial".
- Conecta explícitamente con la dimensión Social del ESG y con la CSRD/reportes de sostenibilidad.
- Menciona que la Red Compromiso Íntegra agrupa a empresas referentes del sector — relevante para el posicionamiento de ${nombre} frente a competidores.
- Enmarca la inclusión laboral como ventaja competitiva, no como obligación.
- NO uses lenguaje de cumplimiento normativo (eso es para otro tipo de propuesta).

INSTRUCCIONES DE FORMATO:
- 3-4 párrafos. Menciona ${nombre} de forma natural (sin sobresaturar).
- Cierre con visión 2026+: invitación a construir algo conjunto y medible.
- Sin bullets, sin títulos, sin presupuesto. Solo texto corrido, español de España.
- Separa párrafos con línea en blanco.
- Devuelve SOLO el texto.`,

    lgd: `Eres el equipo de alianzas de Fundación Íntegra, fundación española de inserción laboral de personas vulnerables. Redactas una PROPUESTA CONSULTIVA Y COMERCIAL para que ${nombre} cumpla con la Ley General de Discapacidad (LGD) de la mano de Íntegra — aprovechando ese cumplimiento para generar impacto social real, no solo cubrir el expediente.

DATOS EMPRESA:
- Nombre: ${nombre}
- Sector: ${sector}
${tamano ? `- Tamaño: ${tamano}` : ''}
${historial ? `- Historial con Íntegra: ${historial}` : ''}
${valores ? `- Valores RSC: ${valores}` : ''}
${contexto ? `- Contexto: ${contexto}` : ''}
LÍNEAS A DESTACAR: ${lineas.join(', ') || 'cumplimiento LGD y contratación directa'}

ENFOQUE CONSULTIVO (normativo + impacto):
- Tono comercial y práctico. Resolvemos un problema concreto: la obligación de reservar el 2% de la plantilla a personas con discapacidad (LGD).
- Vocabulario normativo: "cumplimiento", "certificado de excepcionalidad", "medidas alternativas", "contratación directa", "auditoría laboral".
- Reconoce el reto operativo de cumplir la LGD en el día a día de ${nombre} sin sacrificar eficiencia.
- Posiciona a Íntegra como el partner técnico que hace el trabajo pesado: búsqueda de candidatos, gestión documental, renovación del certificado si procede.
- Añade la capa ESG: cumplir "bien" la LGD (con contratación directa real) es mejor que solo "aprobar el examen" con medidas alternativas. Genera reputación e impacto medible.
- NO uses lenguaje de alianza estratégica de largo plazo (eso es para socios Compromiso Íntegra).

INSTRUCCIONES DE FORMATO:
- 3-4 párrafos. Menciona ${nombre} con naturalidad.
- Cierre orientado a los próximos pasos operativos (reunión, calendario, documentación).
- Sin bullets, sin títulos, sin presupuesto. Solo texto corrido, español de España.
- Separa párrafos con línea en blanco.
- Devuelve SOLO el texto.`,

    general: `Eres el equipo de alianzas de Fundación Íntegra, fundación española de inserción laboral de personas vulnerables. Redactas una PROPUESTA EXPLORATORIA de colaboración con ${nombre} — una primera toma de contacto donde todavía no están cerradas ni la forma ni el alcance de la colaboración.

DATOS EMPRESA:
- Nombre: ${nombre}
- Sector: ${sector}
${tamano ? `- Tamaño: ${tamano}` : ''}
${historial ? `- Historial con Íntegra: ${historial}` : ''}
${valores ? `- Valores RSC: ${valores}` : ''}
${contexto ? `- Contexto: ${contexto}` : ''}
LÍNEAS POSIBLES: ${lineas.join(', ') || 'varias líneas por definir'}

ENFOQUE EXPLORATORIO (abrir conversación, no cerrar trato):
- Tono de descubrimiento, no de venta. Queremos encontrar el mejor formato de colaboración juntos.
- Vocabulario de exploración: "explorar sinergias", "identificar puntos de conexión", "primera colaboración", "ámbitos de encuentro".
- Presenta a Íntegra como una fundación versátil: puede aportar valor de muchas formas (desde reclutamiento puntual hasta alianzas estratégicas), y quiere entender qué encaja mejor con el momento de ${nombre}.
- Flexibilidad en la forma: puede ser colaboración puntual, programa piloto, acción de voluntariado específica... según interés mutuo.
- NO comprometas a ${nombre} con formatos concretos ni vocabulario de alianza cerrada.

INSTRUCCIONES DE FORMATO:
- 3-4 párrafos. Menciona ${nombre} con naturalidad.
- Cierre con invitación clara a una reunión para concretar ámbitos de colaboración.
- Sin bullets, sin títulos, sin presupuesto. Solo texto corrido, español de España.
- Separa párrafos con línea en blanco.
- Devuelve SOLO el texto.`
  };

  const prompt = promptsPorTipo[tipo] ?? promptsPorTipo.general;

  // 5) Llamar a Anthropic directamente vía fetch (sin SDK → cero dependencias)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Anthropic ${res.status}: ${errText.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const json = (await res.json()) as {
      content?: Array<{ text?: string }>;
    };
    const texto = (json.content ?? [])
      .map((b) => b.text ?? '')
      .join('')
      .trim();

    if (!texto) {
      return NextResponse.json(
        { error: 'La IA devolvió una respuesta vacía' },
        { status: 502 }
      );
    }

    return NextResponse.json({ texto });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
