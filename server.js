const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and serve your static files
app.use(express.json());
app.use(express.static('.')); 

// Secure endpoint for AI chat
app.post('/api/chat', async (req, res) => {
    try {
        const apiKey = process.env.GOOGLE_API_KEY; 
        
        if (!apiKey) {
            return res.status(500).json({ error: "API Key is missing on the server." });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to connect to Gemini API" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));