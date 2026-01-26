// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();

// --------------------
// MIDDLEWARE
// --------------------
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --------------------
// CONFIG
// --------------------
const PORT = process.env.PORT || 3000;

const SYSTEM_PROMPT = `
You are SUZI, the AI Secretary for Kyaw Khaing Tun.

RULES:
- Respond ONLY in valid JSON
- No markdown blocks like \`\`\`
- No explanations outside JSON

FORMAT:
{
  "message": "Your response here (markdown allowed)",
  "suggested_options": ["Option 1", "Option 2"]
}
`;

// --------------------
// AI CHAT ENDPOINT
// --------------------
app.post('/api/chat', async (req, res) => {
  try {
    const { contents } = req.body;
    const API_KEY = process.env.GOOGLE_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({
        message: "GOOGLE_API_KEY is missing.",
        suggested_options: ["Fix server config"]
      });
    }

    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({
        message: "Invalid request format.",
        suggested_options: ["Retry"]
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
            ...contents
          ],
          generationConfig: {
            temperature: 0.4,
            response_mime_type: "application/json"
          }
        })
      }
    );

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        message: text || "Empty AI response.",
        suggested_options: ["Retry"]
      };
    }

    res.json(parsed);

  } catch (error) {
    console.error("AI ERROR:", error);
    res.status(500).json({
      message: "Suzi is sleeping right now 😴",
      suggested_options: ["Retry"]
    });
  }
});

// --------------------
// FALLBACK → FRONTEND
// --------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --------------------
// START SERVER
// --------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
