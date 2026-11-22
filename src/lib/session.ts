import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE = 'maildesk_session';

function getSigningKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required for secure sessions');
  return key;
}

function sign(payload: string): string {
  return createHmac('sha256', getSigningKey()).update(payload).digest('base64url');
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function getSessionUserId(req: NextRequest): string | null {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.userId || Number(data.expiresAt) <= Date.now()) return null;
    return data.userId;
  } catch {
    return null;
  }
}

export function requireSession(req: NextRequest): { userId: string; error: null } | { userId: null; error: NextResponse } {
  const userId = getSessionUserId(req);
  if (!userId) {
    return {
      userId: null,
      error: NextResponse.json({ error: 'Connect Gmail to establish a secure session' }, { status: 401 }),
    };
  }
  return { userId, error: null };
}
