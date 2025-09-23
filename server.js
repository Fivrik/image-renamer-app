const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// API endpoint for people detection
app.post('/api/detect-people', async (req, res) => {
  try {
    const { imageData, originalName, knownPeople } = req.body;

    if (!imageData || !originalName) {
      return res.status(400).json({ error: 'Missing imageData or originalName' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
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

    // Create a prompt that includes information about known people
    const knownPeoplePrompt = knownPeople && knownPeople.length > 0
      ? `\n\nKnown people to look for:\n${knownPeople.map(p =>
          `- ${p.name}: ${p.description}${p.aliases ? ` (also known as: ${p.aliases.join(', ')})` : ''}`
        ).join('\n')}\n\nFor each person you recognize from the known people list, include their exact name and confidence level (high/medium/low).`
      : '\n\nSince no known people are registered, describe the people you see in general terms (e.g., "adult_male", "young_woman", "child", etc.).';

    const requestBody = {
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            {
              type: 'text',
              text: `Look at this image and identify any people you can see. ${knownPeoplePrompt}

Return your response as a JSON object with this exact format:
{
  "detectedPeople": [
    {
      "name": "person_name_or_description",
      "confidence": "high|medium|low",
      "description": "brief description of what you see"
    }
  ]
}

If no people are visible, return an empty detectedPeople array. Use lowercase names with underscores instead of spaces.`,
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
      const contentType = response.headers.get('content-type') || '';
      let detail = undefined;
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

    const data = await response.json();
    let raw = data?.content?.[0]?.text?.trim();
    if (!raw) {
      return res.status(500).json({ error: 'Invalid API response structure' });
    }

    // Parse the JSON response from Claude
    let detectedPeople = [];
    try {
      const parsed = JSON.parse(raw);
      detectedPeople = parsed.detectedPeople || [];
    } catch (parseError) {
      console.error('Failed to parse Claude response as JSON:', raw);
      // Fallback: try to extract people info from text response
      detectedPeople = [];
    }

    return res.status(200).json({ detectedPeople });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    return res.status(500).json({ error: message });
  }
});

// API endpoint - convert the Vercel function to Express
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { imageData, originalName } = req.body;

    if (!imageData || !originalName) {
      return res.status(400).json({ error: 'Missing imageData or originalName' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
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

    const requestBody = {
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            {
              type: 'text',
              text: 'Generate a descriptive filename for this image. The filename should be concise, lowercase, use underscores instead of spaces, and accurately describe the main subject and setting. Respond with only the filename, without the file extension.',
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
      const contentType = response.headers.get('content-type') || '';
      let detail = undefined;
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

    const data = await response.json();
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
});

// Serve the React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎉 AI Image Renamer is running!`);
  console.log(`📂 Open your browser to: http://localhost:${PORT}`);
  console.log(`💡 To stop the server, press Ctrl+C`);
});