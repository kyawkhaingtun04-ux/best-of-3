const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config(); // Load environment variables

const app = express();

// --------------------
// MIDDLEWARE
// --------------------
app.use(cors());
app.use(express.json());
// Serve static files (HTML, CSS, JS, Images) from the current directory
app.use(express.static(__dirname));

// --------------------
// CONFIG
// --------------------
const PORT = process.env.PORT || 3000;

// Uses the new Gemini 2.5 Flash model
const MODEL_NAME = "gemini-2.5-flash"; 

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
// MOCK DATABASE 
// --------------------
app.get('/data/availability', (req, res) => {
    res.json({
        data: [
            { id: "slot1", time: "10:00 AM", available: true },
            { id: "slot2", time: "2:00 PM", available: true }
        ]
    });
});

app.get('/data/appointments', (req, res) => {
    res.json({ data: [] }); 
});

app.get('/data/config', (req, res) => {
    res.json({ data: { maintenance_mode: false } });
});


// --------------------
// AI CHAT ENDPOINT
// --------------------
app.post('/api/chat', async (req, res) => {
  try {
    const { contents } = req.body;
    const API_KEY = process.env.GOOGLE_API_KEY;

    // 1. Validate API Key
    if (!API_KEY) {
      console.error("Error: GOOGLE_API_KEY is missing in environment variables.");
      return res.status(500).json({
        message: "Server Error: API Key missing.",
        suggested_options: ["Check .env file"]
      });
    }

    // 2. Validate Request Body
    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({
        message: "Invalid request format.",
        suggested_options: ["Retry"]
      });
    }

    // 3. Call Google Gemini 2.5 Flash API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // System instructions are supported in Gemini 2.5
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: contents, 
          generationConfig: {
            temperature: 0.4,
            response_mime_type: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    // 4. Handle API Errors
    if (!response.ok) {
        console.error("Gemini API Error:", JSON.stringify(data, null, 2));
        return res.json({ 
            message: `I'm having trouble thinking right now. (${data.error?.message || "API Error"})`, 
            suggested_options: ["Retry later"] 
        });
    }

    // 5. Parse Response
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parsed = {
        message: text || "I didn't get that.",
        suggested_options: ["Retry"]
      };
    }

    res.json(parsed);

  } catch (error) {
    console.error("SERVER ERROR:", error);
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
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`✨ Using Model: ${MODEL_NAME}`);
});
