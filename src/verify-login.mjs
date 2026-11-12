import { createClient } from '@supabase/supabase-js';

export function createLoginVerifier({ config, supabaseUrl, supabaseSecretKey } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('invalid_login_config');
  }
  if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim()
      || typeof supabaseSecretKey !== 'string' || !supabaseSecretKey.trim()) {
    throw new TypeError('supabase_not_configured');
  }

  const configuredIssuer = config.identityProvider?.issuer;
  if (configuredIssuer !== undefined && configuredIssuer !== null) {
    const expectedIssuer = `${new URL(supabaseUrl).origin}/auth/v1`;
    if (configuredIssuer !== expectedIssuer) {
      throw new TypeError('supabase_issuer_mismatch');
    }
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return async function verifyLoginAuthorization(authorization) {
    if (typeof authorization !== 'string' || authorization.length > 8192) return null;
    const match = /^Bearer ([^\s]+)$/iu.exec(authorization);
    if (!match) return null;

    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data?.user?.id) return null;
    return Object.freeze({ userId: data.user.id });
  };
}
