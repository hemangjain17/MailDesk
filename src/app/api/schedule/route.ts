import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { jobs } = await req.json();

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json({ error: 'No jobs provided' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Query active connected account
    const { data: accounts } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
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

      // Check or create a contact / outreach record if needed
      let outreachId = job.outreachRecordId;

      if (!outreachId) {
        // Create contact
        const { data: contact } = await supabaseAdmin
          .from('contacts')
          .insert({
            user_id: account.user_id,
            email: job.to,
            name: job.recipientName || null,
            company: job.company || null,
            position: job.position || null,
          })
          .select()
          .single();

        // Create outreach record
        const { data: outreach } = await supabaseAdmin
          .from('outreach_records')
          .insert({
            user_id: account.user_id,
            contact_id: contact.id,
            current_status: 'Scheduled',
            scheduled_send_at: job.scheduledAt,
          })
          .select()
          .single();

        outreachId = outreach.id;
      } else {
        await supabaseAdmin
          .from('outreach_records')
          .update({
            current_status: 'Scheduled',
            scheduled_send_at: job.scheduledAt,
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
          approved_body: job.body,
          scheduled_at: job.scheduledAt,
          status: 'pending',
          idempotency_key: idempKey,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('Failed to insert scheduled email:', insertErr);
      } else {
        insertedJobs.push(inserted);
      }
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
