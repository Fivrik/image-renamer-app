import type { VercelRequest, VercelResponse } from '@vercel/node';

// Using ES module export syntax for Vercel Edge Function
const handler = async (req: VercelRequest, res: VercelResponse) => {
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
    console.log('Debug - Available env vars:', Object.keys(process.env));
    console.log('Debug - ANTHROPIC env vars:', Object.keys(process.env).filter(k => k.includes('ANTHROPIC')));
    console.log('Debug - API Key Length:', apiKey ? apiKey.length : 0);
    
    if (!apiKey) {
      console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('ANTHROPIC')));
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const base64Data = imageData.split(',')[1];
    const fileExtension = originalName.split('.').pop()?.toLowerCase() || 'jpeg';

    console.log('🔑 API key available:', !!apiKey);
    console.log('📁 File extension:', fileExtension);
    console.log('🖼️ Base64 data length:', base64Data.length);

    console.log('📤 Making request to Anthropic API...', {
      model: 'claude-4-opus-20250514',
      apiKeyPresent: !!apiKey,
      imageSize: base64Data.length,
      endpoint: 'https://api.anthropic.com/v1/messages'
    });

    let response;
    let errorText;
    try {
      const requestBody = {
        model: 'claude-4-opus-20250514',
        max_tokens: 50,
        messages: [{
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
        }]
      };

      console.log('📤 Request structure:', {
        ...requestBody,
        messages: [{
          ...requestBody.messages[0],
          content: requestBody.messages[0].content.map(c => 
            c.type === 'image' ? { ...c, source: { ...c.source, data: '[BASE64_DATA]' }} : c
          )
        }]
      });

      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(requestBody)
      });
    } catch (fetchError) {
      console.error('💥 Network error:', {
        name: fetchError?.constructor?.name,
        message: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
        stack: fetchError instanceof Error ? fetchError.stack : undefined
      });
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(e => 'Failed to read error response');
      console.error('❌ Anthropic API error:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries([...response.headers.entries()]),
        error: errorText
      });
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }
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

    console.log('📨 Response details:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries([...response.headers.entries()])
    });

    if (!response.ok) {
      const errorText = await response.text().catch(e => 'Failed to read error response');
      console.error('❌ API error:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries([...response.headers.entries()]),
        error: errorText,
        key: apiKey ? 'Present (length: ' + apiKey.length + ')' : 'Missing'
      });
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ API response:', {
      status: response.status,
      headers: Object.fromEntries([...response.headers.entries()]),
      data: JSON.stringify(data, null, 2)
    });
    
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
    console.error('💥 Server error:', {
      type: error?.constructor?.name,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown server error',
      type: error?.constructor?.name
    });
  }
}

export { handler as default };