import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PUBLIC_FILES = Object.freeze([
  'index.html',
  'manifest.webmanifest',
  'verification-probes.mjs',
  'icon.svg',
  'aleph.json',
]);
const SUPABASE_URL = /https?:\/\/[a-z0-9.-]+\.supabase\.co(?:\/[^\s"'<>]*)?/iu;
const SUPABASE_PUBLIC_KEY = /\bsb_publishable_[a-z0-9_-]{8,}\b/iu;
const JWT = /\beyJ[a-z0-9_-]{12,}\.eyJ[a-z0-9_-]{12,}\.[a-z0-9_-]{8,}\b/iu;
const SUPABASE_SDK = /@supabase\/(?:supabase-js|ssr)/iu;
const SUPABASE_URL_VARIABLE = /\bSUPABASE_URL\b/iu;

export function assertNoSupabaseCredentialsInPublic(publicDirectory) {
  const root = resolve(publicDirectory);
  for (const publicFile of PUBLIC_FILES) {
    const path = resolve(root, publicFile);
    let content;
    try {
      content = readFileSync(path, 'utf8');
    } catch (error) {
      if (publicFile === 'aleph.json' && error?.code === 'ENOENT') continue;
      throw error;
    }
    if (SUPABASE_URL.test(content) || SUPABASE_PUBLIC_KEY.test(content)
        || JWT.test(content) || SUPABASE_SDK.test(content)
        || SUPABASE_URL_VARIABLE.test(content)) {
      throw new Error(`브라우저 공개 파일에 Supabase 주소·키·클라이언트가 있습니다: ${publicFile}`);
    }
  }
}
