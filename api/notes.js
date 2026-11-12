import { createClient } from '@supabase/supabase-js';
import { verifyLogin } from '../src/verify-login.mjs'; // 경로가 api/notes.js 기준일 때

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  // 1. 로그인(토큰) 검증 — 없으면 401 JSON 반환
  const auth = await verifyLogin(request);
  const userId = auth?.user?.id || auth?.id || auth?.userId;

  if (!userId) {
    response.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

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

    // 2. 쿼리나 헤더 값은 무시하고, 검증된 userId의 메모만 조회
    const { data, error } = await supabase
      .from('notes')
      .select('id, title, body') // 기존 DB 컬럼명이 content라면 'id, title, content'로 유지
      .eq('owner_id', userId);

    if (error) {
      response.status(500).json({ error: 'NOTES_READ_FAILED' });
      return;
    }

    response.status(200).json({ notes: data ?? [] });
  } catch (_error) {
    response.status(500).json({ error: 'NOTES_READ_FAILED' });
  }
}