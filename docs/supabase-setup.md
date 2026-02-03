# Supabase setup (quick)

1. Create a new Supabase project at https://app.supabase.com.
2. Open the SQL editor and paste the contents of `supabase/schema.sql` then run it. This will create tables, policies, and the `join_project_by_code` RPC.
3. In your Supabase project settings, enable Email auth providers (and optionally Google).
4. Copy the Project URL and anon public key and set them in your Expo env:

   - EXPO_PUBLIC_SUPABASE_URL
   - EXPO_PUBLIC_SUPABASE_ANON_KEY

   Put them in a `.env` file at the project root or configure them in your hosting/service.

5. Restart Expo (clear cache recommended):
   - expo start -c

Notes:
- Policies in `schema.sql` enable RLS; the client will only see projects where the signed-in user is a member.
- The RPC `join_project_by_code` is security definer and will insert membership for the authenticated user.
- After sign-in via email+password, the app will show your Projects pulled from Supabase.

Profiles and avatars:
- Create the `profiles` table by running `supabase/profiles.sql` in the SQL editor (this creates the `profiles` table and RLS policy).
- Create a Storage bucket named `avatars` for profile photos. Use the Supabase dashboard to create the bucket and set a policy that allows users to access only their own folder (e.g. path starts_with auth.uid()). Store the public URL or storage path in `profiles.avatar_url`.
