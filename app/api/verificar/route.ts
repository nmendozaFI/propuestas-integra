import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'Servidor sin contraseña configurada' }, { status: 500 });
  }

  if (body.password === expected) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}
