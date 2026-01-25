const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// 1. Allow your website to talk to this server
app.use(cors()); 
app.use(express.json());

// 2. Serve your static files (index.html, profile.png, etc.)
app.use(express.static(path.join(__dirname, '/')));

const PORT = process.env.PORT || 3000;

const SYSTEM_PROMPT = `
You are SUZI, the AI Secretary for Kyaw Khaing Tun. 
Kyaw is a System Engineering student in Japan. 
Respond ONLY in JSON format:
{
  "message": "Your response here (use markdown)",
  "suggested_options": ["Option 1", "Option 2"]
}
`;

app.post('/api/chat', async (req, res) => {
    try {
        const { contents } = req.body;
        const API_KEY = process.env.GOOGLE_API_KEY;

        if (!API_KEY) {
            return res.status(500).json({ message: "API Key missing." });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT }] }, ...contents],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const data = await response.json();
        const aiResponse = data.candidates[0].content.parts[0].text;
        res.send(aiResponse);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Suzi is sleeping right now.", suggested_options: ["Retry"] });
    }
});

// For any other route, serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
