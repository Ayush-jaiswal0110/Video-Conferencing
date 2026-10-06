// Return only recognized error codes and actionable text, never raw provider payloads.
export function openAIError(status, body = {}) {
  const code = body?.error?.code;
  const quota = {
    credit_balance_exhausted: 'OpenAI API credits are exhausted. Add API credits to the organization that owns this key.',
    organization_spend_limit_exceeded: 'The OpenAI organization spend limit was reached. Review the organization billing limit.',
    project_spend_limit_exceeded: 'The OpenAI project spend limit was reached. Review the project billing limit.',
    organization_usage_limit_exceeded: 'The OpenAI organization usage limit was reached. Review the approved API usage limit.',
    insufficient_quota: 'OpenAI API quota is unavailable. Check API billing, credits and project limits for this key. Retrying alone will not fix this.',
  };
  if (Object.hasOwn(quota, code)) return { code, message: quota[code] };
  if (body?.error?.type === 'insufficient_quota') return { code: 'insufficient_quota', message: quota.insufficient_quota };
  if (status === 429 && ['rate_limit_exceeded', 'slow_down'].includes(code)) return { code, message: 'OpenAI temporarily rate-limited this test. Wait before retrying and check the project rate limits.' };
  if (status === 429) return { code: 'provider_limit', message: 'OpenAI rejected the session with HTTP 429. Check API billing/credits and rate limits; the provider did not identify which limit in a recognized error code.' };
  if (status === 401) return { code: 'provider_authentication', message: 'OpenAI rejected the backend API key. Check OPENAI_API_KEY and restart the backend.' };
  if ([403, 404].includes(status)) return { code: 'provider_access', message: 'This key cannot access the configured Realtime model. Check model access and OPENAI_REALTIME_MODEL.' };
  return { code: 'provider_error', message: 'The AI provider rejected the session. Check the backend model configuration and provider status.' };
}
