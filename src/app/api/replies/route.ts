import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: messages, error } = await supabaseAdmin
      .from('email_messages')
      .select('*, outreach_record:outreach_records(*, contact:contacts(*))')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group into threads
    const threadsMap = new Map<string, any>();

    for (const m of messages || []) {
      const threadKey = m.gmail_thread_id || m.outreach_record_id || m.id;
      if (!threadsMap.has(threadKey)) {
        threadsMap.set(threadKey, {
          threadId: threadKey,
          outreachRecord: m.outreach_record || null,
          contact: m.outreach_record?.contact || {
            email: m.direction === 'incoming' ? m.sender_email : m.recipient_email,
            name: m.direction === 'incoming' ? m.sender_email.split('@')[0] : m.recipient_email.split('@')[0],
            company: 'Lead',
            position: 'Role',
          },
          lastMessageAt: m.sent_at || m.received_at || m.created_at,
          latestSnippet: m.body_text?.slice(0, 100) || '',
          hasReply: m.direction === 'incoming',
          messages: [],
        });
      }

      const entry = threadsMap.get(threadKey);
      entry.messages.push(m);
      if (m.direction === 'incoming') {
        entry.hasReply = true;
      }
      entry.lastMessageAt = m.sent_at || m.received_at || m.created_at;
      entry.latestSnippet = m.body_text?.slice(0, 120) || '';
    }

    const threadList = Array.from(threadsMap.values()).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );

    return NextResponse.json({
      success: true,
      threads: threadList,
      rawMessages: messages || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
