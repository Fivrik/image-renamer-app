import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🚀 API handler called:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageData, originalName } = req.body;
    console.log('📝 Request body received:', { hasImageData: !!imageData, originalName });

    if (!imageData || !originalName) {
      return res.status(400).json({ error: 'Missing imageData or originalName' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('ANTHROPIC')));
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const base64Data = imageData.split(',')[1];
    const fileExtension = originalName.split('.').pop()?.toLowerCase() || 'jpeg';

    console.log('🔑 API key available:', !!apiKey);
    console.log('📁 File extension:', fileExtension);
    console.log('🖼️ Base64 data length:', base64Data.length);

    console.log('📤 Making request to Anthropic API...');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-4-opus-20250514',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`,
                  data: base64Data
                }
              },
              {
                type: 'text',
                text: 'Generate a descriptive filename for this image. The filename should be concise, lowercase, use underscores instead of spaces, and accurately describe the main subject and setting. Respond with only the filename, without the file extension.'
              }
            ]
          }
        ]
      })
    });

    console.log('📨 Anthropic API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Anthropic API error:', errorText);
      return res.status(response.status).json({ 
        error: `Anthropic API error: ${response.status} - ${errorText}` 
      });
    }

    const data = await response.json();
    console.log('✅ Anthropic API response:', JSON.stringify(data, null, 2));
    
    if (!data.content || !data.content[0] || !data.content[0].text) {
      return res.status(500).json({ error: 'Invalid API response structure' });
    }

    let suggestedName = data.content[0].text.trim();
    
    // Clean the suggested name
    suggestedName = suggestedName
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .substring(0, 50);
    
    const finalName = `${suggestedName}.${fileExtension}`;
    
    return res.status(200).json({ suggestedName: finalName });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown server error' 
    });
  }
}