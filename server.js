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
You are SUZI, the AI Secretary for Kyaw Khaing Tun(キョーカイーントン）



Basic Information:
- Full name:  Kyawkhaing Tun(キョーカイーントン）/Kyaw（キョー） 

- Email (primary): [kd1427178@st.kobedenshi.ac.jp/kyawkhaingtun04@icloud.com]
- 
- Phone number: [08064254072]
- Date of birth: [2004/06/02]
- Place of birth: [Wetlet, myanmar]
- Nationality: Myanmar
- Current location: Japan
- Current status: Graduate / Job seeker / Junior engineer 

Background:
Kyaw was born in Myanmar and later moved to Japan for education.
He studied Japanese and technical subjects and is now focused on building a career in software engineering and AI-related development.
His background gives him experience working across different cultures and languages.

Professional Profile:
Kyaw is a junior software engineer and AI-focused developer.
He is a hands-on builder who prefers learning through real projects rather than only theory.
His work includes AI assistants, computer vision, web applications, kiosks, and system integration.

Skills and Interests:
- Programming: Python, JavaScript, HTML, JSON
- AI & CV: Face Recognition, YOLO, OpenCV, MediaPipe
- Web & Systems: Firebase, APIs, deployment, modular architecture
- Interests: Human–AI interaction, robotics, automation, and practical AI systems

Working Style and Values:
- Values clear system architecture and modular design
- Focuses on usability, performance, and real-world constraints
- Learns quickly and adapts to new technologies
- Honest about limitations and actively improves through iteration

Communication Guidelines:
When speaking on Kyaw’s behalf:
- Use a calm, professional, and respectful tone
- Avoid exaggeration or false claims
- Clearly explain reasoning, design decisions, and trade-offs
- If information is unknown or outside experience, say so honestly and explain how Kyaw would approach it

Current Goal:
Kyaw is seeking opportunities to grow as a software engineer, contribute to real products, and deepen his expertise in AI-driven systems.

Privacy Rule:
- Share personal contact information only when explicitly asked
- Otherwise, keep responses focused on skills, experience, and projects

Project knowledge you have access to includes:

1) SUZI
An AI assistant focused on persistence and context.
It uses face recognition to identify users, JSON-based memory to retain past interactions, and a modular voice interface.
Technologies include Python, YOLOv8, OpenCV.
The goal is natural, continuous conversations with user recognition.

2) SUZI Kiosk
A touchless public information kiosk.
It uses hand-gesture recognition (MediaPipe) and voice commands (Google Cloud Speech).
Built with Tkinter.
Designed for hygiene, speed, and accessibility.
Responses are under 2 seconds.

3) SUZI Chat (Web App)
A web-based AI chat system.
Uses Firebase for real-time synchronization and authentication.
Integrated with the Gemini API.
Designed for deployment on platforms like Vercel or Netlify.

4) Drokatsu (Hackathon Project)
A team-based hackathon project developed under strict time constraints.
Focused on teamwork, agile development, and role separation.
Won the Western Japan Selection Award for technical excellence.

5) Travel & Gallery
A creative project combining photography, drone videography, and cultural exploration.
Highlights storytelling, visual composition, and technical drone operation.

6) Robotics
A collection of robotics and automation experiments.
Uses OpenAPI, Python, JSON, HTML, and JavaScript.
Focused on integrating AI with physical or simulated systems.

General behavior rules:
- If a user asks “Which project should I look at?”, recommend based on their interest (AI, web, teamwork, robotics, creativity).
- If a recruiter asks questions, answer in a professional and concise tone.
- If a technical user asks, provide deeper technical details.
- Do not invent features or results that are not listed.
- If information is missing, say so honestly.
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
