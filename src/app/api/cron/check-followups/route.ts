import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { authorizeCronRequest } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const unauthorized = authorizeCronRequest(req);
    if (unauthorized) return unauthorized;

    // Cron requests have no browser session, so use the server-only service role.
    const supabase = getSupabaseAdmin();

    // Find sent records that have not received replies and have passed followup due date
    const { data: dueRecords } = await supabase
      .from('outreach_records')
      .select('*, contact:contacts(*)')
      .eq('current_status', 'Sent')
      .is('last_reply_at', null);

    const flagged = [];

    if (dueRecords) {
      for (const rec of dueRecords) {
        if (!rec.sent_at) continue;

        const sentDate = new Date(rec.sent_at);
        const daysElapsed = (Date.now() - sentDate.getTime()) / (1000 * 3600 * 24);

        if (daysElapsed >= (rec.followup_days || 5)) {
          // Update status to 'Follow-up Due'
          await supabase
            .from('outreach_records')
            .update({
              current_status: 'Follow-up Due',
              updated_at: new Date().toISOString(),
            })
            .eq('id', rec.id);

          const { data: existingReminder } = await supabase
            .from('followup_reminders')
            .select('id')
            .eq('outreach_record_id', rec.id)
            .in('status', ['pending', 'snoozed'])
            .limit(1)
            .maybeSingle();
          if (!existingReminder) {
            await supabase.from('followup_reminders').insert({
              user_id: rec.user_id,
              outreach_record_id: rec.id,
              due_at: new Date().toISOString(),
              status: 'pending',
              sequence_number: 1,
            });
          }

          // Create notification
          await supabase.from('notifications').insert({
            user_id: rec.user_id,
            type: 'followup_due',
            title: `Follow-up Due: ${rec.contact?.name || rec.contact?.email}`,
            message: `No reply received after ${Math.floor(daysElapsed)} days. Review and send a follow-up.`,
            related_record_id: rec.id,
            is_read: false,
          });

          flagged.push(rec.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      flaggedCount: flagged.length,
      flaggedIds: flagged,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
