import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.error) return session.error;
    const supabase = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('followup_reminders')
      .select('*, outreach_record:outreach_records(*, contact:contacts(*), template:email_templates(*))')
      .eq('user_id', session.userId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ followups: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Could not load follow-ups' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.error) return session.error;
    const { reminderId, days = 3 } = await req.json();
    if (!UUID_PATTERN.test(reminderId || '')) {
      return NextResponse.json({ error: 'A persisted reminder is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: parent, error: parentError } = await supabase
      .from('followup_reminders')
      .select('*')
      .eq('id', reminderId)
      .eq('user_id', session.userId)
      .single();
    if (parentError) throw parentError;

    const sequenceNumber = (parent.sequence_number || 1) + 1;
    const dueAt = new Date(Date.now() + Math.max(1, Number(days)) * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('followup_reminders')
      .insert({
        user_id: parent.user_id,
        outreach_record_id: parent.outreach_record_id,
        due_at: dueAt,
        status: 'pending',
        parent_reminder_id: parent.id,
        sequence_number: sequenceNumber,
      })
      .select('*, outreach_record:outreach_records(*, contact:contacts(*), template:email_templates(*))')
      .single();
    if (error) throw error;

    return NextResponse.json({ followup: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Could not create the next follow-up' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.error) return session.error;
    const { reminderId, status, dueAt } = await req.json();
    if (!UUID_PATTERN.test(reminderId || '')) {
      return NextResponse.json({ error: 'A persisted reminder is required' }, { status: 400 });
    }

    const allowedStatuses = new Set(['pending', 'snoozed', 'completed', 'dismissed']);
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: 'Invalid reminder status' }, { status: 400 });
    }

    const updates: Record<string, string | null> = {
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    };
    if (dueAt) updates.due_at = dueAt;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('followup_reminders')
      .update(updates)
      .eq('id', reminderId)
      .eq('user_id', session.userId)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ followup: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Could not update follow-up' }, { status: 500 });
  }
}
