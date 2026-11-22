import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizeTemplateHtml, sanitizeEmailHtml } from '@/lib/email-html';
import { requireSession } from '@/lib/session';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.error) return session.error;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('scheduled_emails')
      .select('*, outreach_record:outreach_records(*, contact:contacts(*), template:email_templates(*))')
      .eq('user_id', session.userId)
      .order('scheduled_at', { ascending: false })
      .limit(250);
    if (error) throw error;
    return NextResponse.json({ jobs: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Could not load scheduled emails' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.error) return session.error;
    const { jobs } = await req.json();

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json({ error: 'No jobs provided' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Query active connected account
    const { data: accounts } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
      .eq('user_id', session.userId)
      .eq('connection_status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (!accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: 'No connected Gmail account found in Supabase' },
        { status: 400 }
      );
    }

    const account = accounts[0];

    const insertedJobs = [];

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const idempKey = `idemp_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;

      // Browser-only rows use IDs such as `out_...`, while Supabase foreign keys
      // require UUIDs. Reuse a real persisted row when present; otherwise create it.
      let outreachId: string | null = null;
      if (UUID_PATTERN.test(job.outreachRecordId || '')) {
        const { data: existingOutreach } = await supabaseAdmin
          .from('outreach_records')
          .select('id')
          .eq('id', job.outreachRecordId)
          .eq('user_id', account.user_id)
          .maybeSingle();
        outreachId = existingOutreach?.id || null;
      }
      if (!outreachId && job.outreachRecordId) {
        const { data: correlatedOutreach } = await supabaseAdmin
          .from('outreach_records')
          .select('id')
          .eq('user_id', account.user_id)
          .eq('client_outreach_id', job.outreachRecordId)
          .maybeSingle();
        outreachId = correlatedOutreach?.id || null;
      }

      if (!outreachId) {
        const normalizedEmail = String(job.to || '').trim().toLowerCase();
        if (!normalizedEmail) throw new Error('A recipient email is required for every scheduled job');

        let { data: contact, error: contactQueryError } = await supabaseAdmin
          .from('contacts')
          .select('*')
          .eq('user_id', account.user_id)
          .ilike('email', normalizedEmail)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (contactQueryError) throw contactQueryError;

        if (!contact) {
          const { data: createdContact, error: contactInsertError } = await supabaseAdmin
            .from('contacts')
            .insert({
              user_id: account.user_id,
              email: normalizedEmail,
              name: job.recipientName || null,
              company: job.company || null,
              position: job.position || null,
            })
            .select()
            .single();
          if (contactInsertError) throw contactInsertError;
          contact = createdContact;
        }

        const { data: outreach, error: outreachInsertError } = await supabaseAdmin
          .from('outreach_records')
          .insert({
            user_id: account.user_id,
            contact_id: contact.id,
            client_outreach_id: job.outreachRecordId || null,
            current_status: 'Scheduled',
            scheduled_send_at: job.scheduledAt,
            job_link: job.jobLink || null,
            followup_days: job.followupDays || 5,
          })
          .select()
          .single();
        if (outreachInsertError) throw outreachInsertError;
        outreachId = outreach.id;
      } else {
        await supabaseAdmin
          .from('outreach_records')
          .update({
            current_status: 'Scheduled',
            scheduled_send_at: job.scheduledAt,
            job_link: job.jobLink || null,
            followup_days: job.followupDays || 5,
            updated_at: new Date().toISOString(),
          })
          .eq('id', outreachId);
      }

      // Insert into scheduled_emails
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('scheduled_emails')
        .insert({
          user_id: account.user_id,
          outreach_record_id: outreachId,
          email_account_id: account.id,
          approved_subject: job.subject,
          approved_body: sanitizeEmailHtml(normalizeTemplateHtml(job.body || '')),
          scheduled_at: job.scheduledAt,
          status: 'pending',
          idempotency_key: idempKey,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      insertedJobs.push({ ...inserted, clientOutreachId: job.outreachRecordId });
    }

    return NextResponse.json({
      success: true,
      scheduledCount: insertedJobs.length,
      jobs: insertedJobs,
    });
  } catch (error: any) {
    console.error('Schedule error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.error) return session.error;
    const id = req.nextUrl.searchParams.get('id');
    if (!id || !UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'A valid scheduled job ID is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: job, error: jobError } = await supabase
      .from('scheduled_emails')
      .select('id, outreach_record_id, status')
      .eq('id', id)
      .eq('user_id', session.userId)
      .single();
    if (jobError) throw jobError;
    if (job.status === 'sent') {
      return NextResponse.json({ error: 'A sent email cannot be deleted from the queue' }, { status: 409 });
    }

    const { error: reminderError } = await supabase
      .from('followup_reminders')
      .delete()
      .eq('outreach_record_id', job.outreach_record_id);
    if (reminderError) throw reminderError;

    const { error: deleteError } = await supabase.from('scheduled_emails').delete().eq('id', id);
    if (deleteError) throw deleteError;

    await supabase
      .from('outreach_records')
      .update({ current_status: 'Draft', scheduled_send_at: null, updated_at: new Date().toISOString() })
      .eq('id', job.outreach_record_id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Could not delete scheduled email' }, { status: 500 });
  }
}
