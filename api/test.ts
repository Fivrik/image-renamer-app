import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const hasApiKey = !!(process.env.ANTHROPIC_API_KEY || (process.env.NODE_ENV !== 'production' ? process.env.VITE_ANTHROPIC_API_KEY : undefined));
  return res.status(200).json({
    message: 'API test successful',
    hasApiKey,
    method: req.method,
  });
}
