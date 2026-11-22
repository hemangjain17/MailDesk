import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      error: 'Replies / Inbox is temporarily unavailable while thread synchronization is under development.',
      featureStatus: 'locked',
    },
    { status: 423 }
  );
}
