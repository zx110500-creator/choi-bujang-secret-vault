import { createClient } from '@supabase/supabase-js';

export default async function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    response.status(500).json({ error: 'SUPABASE_NOT_CONFIGURED' });
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from('notes')
      .select('title, content')
      .limit(4);

    if (error) {
      response.status(500).json({ error: 'NOTES_READ_FAILED' });
      return;
    }

    response.status(200).json({ notes: data ?? [] });
  } catch (_error) {
    response.status(500).json({ error: 'NOTES_READ_FAILED' });
  }
}
