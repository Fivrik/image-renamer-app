import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
  
  return res.status(200).json({ 
    message: 'API test successful',
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none',
    envVars: Object.keys(process.env).filter(k => k.includes('ANTHROPIC')),
    method: req.method
  });
}