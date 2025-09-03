import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RequestBody {
  imageData: string;
  originalName: string;
}

type AnthropicMessage = {
  role: 'user';
  content: Array<
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    | { type: 'text'; text: string }
  >;
};

interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
}

interface AnthropicResponse {
  content?: Array<{ text?: string; type: string }>;
}

const handler = async (req: VercelRequest, res: VercelResponse): Promise<VercelResponse> => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawBody = req.body as unknown;
    const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    const { imageData, originalName } = (parsed || {}) as Partial<RequestBody>;

    if (!imageData || !originalName) {
      return res.status(400).json({ error: 'Missing imageData or originalName' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || (process.env.NODE_ENV !== 'production' ? process.env.VITE_ANTHROPIC_API_KEY : undefined);
    if (!apiKey) {
      return res.status(500).json({ error: 'Server misconfigured: missing ANTHROPIC_API_KEY' });
    }

    // Extract mime + base64 from data URL if present
    const isDataUrl = imageData.startsWith('data:');
    let mediaType = 'image/jpeg';
    let base64Data = imageData;

    if (isDataUrl) {
      const [meta, data] = imageData.split(',', 2);
      base64Data = data || '';
      const match = /^data:(.+?);base64$/i.exec(meta);
      if (match?.[1]) {
        mediaType = match[1].toLowerCase();
      }
    } else {
      const ext = (originalName.split('.').pop() || 'jpeg').toLowerCase();
      mediaType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    }

    if (!base64Data) {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    const requestBody: AnthropicRequestBody = {
      // Pin to a known, stable model variant to avoid 400s on unknown aliases
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: [
            // Use widely supported image content block format
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            {
              type: 'text',
              text:
                'Generate a descriptive filename for this image. The filename should be concise, lowercase, use underscores instead of spaces, and accurately describe the main subject and setting. Respond with only the filename, without the file extension.',
            },
          ],
        },
      ],
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey.trim(),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Try JSON first for structured error, fallback to text
      const contentType = response.headers.get('content-type') || '';
      let detail: unknown = undefined;
      if (contentType.includes('application/json')) {
        detail = await response.json().catch(() => undefined);
      }
      if (!detail) {
        const errorText = await response.text().catch(() => 'Failed to read error response');
        detail = errorText.slice(0, 2000);
      }
      return res.status(response.status).json({
        error: 'Upstream Anthropic error',
        status: response.status,
        detail,
      });
    }

    const data = (await response.json()) as AnthropicResponse;
    let raw = data?.content?.[0]?.text?.trim();
    if (!raw) {
      return res.status(500).json({ error: 'Invalid API response structure' });
    }

    // If the model returned a trailing extension, strip it before sanitizing
    raw = raw.replace(/\.(jpe?g|png|gif|webp|tiff|bmp)$/i, '');

    const fromExt = isDataUrl
      ? mediaType.split('/')[1]
      : (originalName.split('.').pop() || 'jpeg').toLowerCase();
    const ext = (fromExt === 'jpg' ? 'jpeg' : fromExt).replace(/[^a-z0-9]/gi, '') || 'jpeg';

    let name = raw
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .slice(0, 80)
      .replace(/^_+|_+$/g, '') || 'image';

    const finalName = `${name}.${ext}`;
    return res.status(200).json({ suggestedName: finalName });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    return res.status(500).json({ error: message });
  }
};

export default handler;
