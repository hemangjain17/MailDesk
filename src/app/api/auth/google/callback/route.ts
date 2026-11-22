import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuth2Client } from '@/lib/gmail';
import { encryptToken } from '@/lib/crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { google } from 'googleapis';
import { createSessionToken, SESSION_COOKIE } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL('/settings?error=' + encodeURIComponent(error), req.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/settings?error=no_code', req.url));
    }

    const oauth2Client = getGoogleOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Retrieve user email & profile info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    const name = userInfo.data.name || email?.split('@')[0] || 'Job Hunter';

    if (!email) {
      throw new Error('Unable to fetch email address from Google OAuth profile');
    }

    // Encrypt refresh and access tokens
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
    const encryptedAccessToken = tokens.access_token ? encryptToken(tokens.access_token) : null;

    // Use Supabase Admin (service_role) to persist into Supabase Cloud
    let userId = '';
    try {
      const supabaseAdmin = getSupabaseAdmin();

      // Find or create user in Supabase auth.users
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = usersList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

      if (existingUser) {
        userId = existingUser.id;
      } else {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          email_confirm: true,
          user_metadata: { full_name: name },
        });
        if (createErr || !newUser?.user) {
          throw createErr || new Error('Failed to create Supabase user');
        }
        userId = newUser.user.id;
      }

      // Upsert profile
      await supabaseAdmin.from('profiles').upsert(
        {
          id: userId,
          full_name: name,
          timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
          default_followup_days: 5,
          default_signature: `Best regards,\n${name}\nEmail: ${email}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      // Upsert email_accounts in Supabase Cloud
      await supabaseAdmin.from('email_accounts').upsert(
        {
          user_id: userId,
          provider: 'gmail',
          email_address: email,
          access_token_enc: encryptedAccessToken,
          refresh_token_enc: encryptedRefreshToken,
          connection_status: 'connected',
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider,email_address' }
      );
    } catch (dbErr) {
      console.warn('Could not save to Supabase Cloud directly, fallback will use client state:', dbErr);
    }

    const redirectUrl = new URL('/contacts', req.url);
    redirectUrl.searchParams.set('status', 'connected');
    redirectUrl.searchParams.set('email', email);
    redirectUrl.searchParams.set('name', name);
    if (userId) redirectUrl.searchParams.set('user_id', userId);

    const response = NextResponse.redirect(redirectUrl);
    if (userId) {
      response.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
    }
    return response;
  } catch (err: any) {
    console.error('Google OAuth callback error:', err);
    return NextResponse.redirect(new URL('/contacts?error=' + encodeURIComponent(err.message), req.url));
  }
}
