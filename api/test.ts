import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Prefer server-only key; allow VITE_ fallback only in non-production for local sanity checks
  const nodeEnv = process.env.NODE_ENV || 'development';
  const hasServerKey = !!process.env.ANTHROPIC_API_KEY;
  const hasViteKey = nodeEnv !== 'production' && !!process.env.VITE_ANTHROPIC_API_KEY;

  const activeKey = hasServerKey
    ? process.env.ANTHROPIC_API_KEY
    : (hasViteKey ? process.env.VITE_ANTHROPIC_API_KEY : undefined);

  const source = hasServerKey
    ? 'ANTHROPIC_API_KEY'
    : (hasViteKey ? 'VITE_ANTHROPIC_API_KEY' : null);

  const maskedSuffix = activeKey ? activeKey.slice(-6) : null;
  const keyLength = activeKey ? activeKey.length : 0;
  const region = process.env.VERCEL_REGION || process.env.AWS_REGION || null;
  const nodeVersion = process.version;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    message: 'API test successful',
    method: req.method,
    nodeEnv,
    hasApiKey: !!activeKey,
    source,
    maskedSuffix,
    keyLength,
    region,
    nodeVersion,
  });
}
