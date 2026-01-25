const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Use the port Render provides, or 3000 locally
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// --- DATA STORAGE LOGIC ---
// This ensures your app doesn't crash if the data files are missing
const dataFiles = ['availability.json', 'appointments.json', 'config.json'];
dataFiles.forEach(file => {
    const filePath = path.join(__dirname, 'data', file);
    if (!fs.existsSync(path.dirname(filePath))) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify({ data: [] }));
    }
});

// Routes to get and save data
app.get('/data/:file', (req, res) => {
    const filePath = path.join(__dirname, 'data', `${req.params.file}.json`);
    res.sendFile(filePath);
});

app.post('/data/:file', (req, res) => {
    const filePath = path.join(__dirname, 'data', `${req.params.file}.json`);
    fs.writeFileSync(filePath, JSON.stringify(req.body));
    res.json({ success: true });
});

// --- AI LOGIC (SUZI) ---

const SYSTEM_PROMPT = `
You are SUZI, the AI Secretary for Kyaw Khaing Tun. 
Kyaw is a System Engineering student in Japan focused on AI and Robotics.

IMPORTANT RULES:
1. You must ALWAYS respond in a valid JSON format.
2. Do not use conversational text outside of the JSON block.
3. Use Markdown for the "message" field to make it look professional.

RESPONSE FORMAT:
{
  "message": "Your helpful response here...",
  "suggested_options": ["About Kyaw", "View Projects", "Check Availability"],
  "booking_action": { "slot_id": null, "name": null, "time": null, "reason": null }
}
`;

app.post('/api/chat', async (req, res) => {
    try {
        const { contents } = req.body;
        const API_KEY = process.env.GOOGLE_API_KEY;

        if (!API_KEY) {
            return res.status(500).json({ message: "API Key missing in Render Environment Variables." });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
                    ...contents
                ],
                generationConfig: {
                    response_mime_type: "application/json"
                }
            })
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            // Send the raw JSON string from Gemini back to the frontend
            res.send(data.candidates[0].content.parts[0].text);
        } else {
            throw new Error("Invalid response from Google API");
        }

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ 
            message: "I'm having trouble connecting to my brain. Please check the server logs.",
            suggested_options: ["Try again"] 
        });
    }
});

// Handle all other routes by serving index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
