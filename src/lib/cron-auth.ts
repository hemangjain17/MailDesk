import { NextRequest, NextResponse } from 'next/server';

function isLocalRequest(req: NextRequest): boolean {
  const hostname = req.nextUrl.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Protects background-worker endpoints in every hosted environment.
 *
 * AWS invokes these routes with `Authorization: Bearer <CRON_SECRET>`.
 * Local development remains convenient, but a deployed app fails closed when
 * CRON_SECRET is missing instead of exposing Gmail/Supabase operations publicly.
 */
export function authorizeCronRequest(req: NextRequest): NextResponse | null {
  if (isLocalRequest(req) && process.env.NODE_ENV !== 'production') {
    return null;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET is not configured; refusing background-worker request.');
    return NextResponse.json(
      { error: 'Background worker is not configured' },
      { status: 503 }
    );
  }

  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
