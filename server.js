import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import admin from "firebase-admin";
import cron from "node-cron";

// 1. DATABASE INITIALIZATION
import serviceAccount from "./serviceAccount.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://suzi-831a8-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   CONFIG & ENV
========================= */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_SECRET = process.env.LINE_CHANNEL_SECRET;
const pendingLinks = new Map(); 

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

/* =========================
   HELPERS
========================= */

async function sendLine(lineUserId, text) {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_TOKEN}`
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text }]
      })
    });
    if (!res.ok) console.error("LINE API Error:", await res.text());
  } catch (err) { console.error("❌ Push Error:", err); }
}

async function reply(replyToken, text) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_TOKEN}`
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] })
  });
}

function verifySignature(req) {
  const signature = req.headers["x-line-signature"];
  const hash = crypto.createHmac("sha256", LINE_SECRET).update(req.rawBody).digest("base64");
  return hash === signature;
}

/* =========================
   CRON SCHEDULER (Every 1 Minute)
========================= */
cron.schedule("* * * * *", async () => {
  console.log("⏰ Cron check started...");

  // FIX 2: Cleanup expired tokens from memory
  for (const [code, record] of pendingLinks) {
    if (Date.now() > record.expires) pendingLinks.delete(code);
  }

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const snapshot = await db.ref("reminders").get();
  if (!snapshot.exists()) return;

  const remindersByUser = snapshot.val();

  for (const safeEmail in remindersByUser) {
    try {
      const reminders = remindersByUser[safeEmail];
      const linkSnap = await db.ref(`line_links/${safeEmail}`).get();
      if (!linkSnap.exists()) continue;
      
      const { lineUserId } = linkSnap.val();

      for (const reminderId in reminders) {
        const r = reminders[reminderId];
        const eventTime = new Date(r.timeISO);
        const diff = now - eventTime;

        // 1. Morning Notification (8:00 AM JST)
        if (r.morning && !r.morningSent) {
          const morningTime = new Date(eventTime);
          morningTime.setHours(8, 0, 0, 0);
          if (now >= morningTime) {
            await sendLine(lineUserId, `🌅 今日の予定:\n${r.text}`);
            await db.ref(`reminders/${safeEmail}/${reminderId}/morningSent`).set(true);
          }
        }

        // 2. 1 Hour Before
        if (r.oneHour && !r.oneHourSent) {
          const oneHourBefore = new Date(eventTime.getTime() - 60 * 60 * 1000);
          if (now >= oneHourBefore) {
            await sendLine(lineUserId, `⏰ 1時間前です:\n${r.text}`);
            await db.ref(`reminders/${safeEmail}/${reminderId}/oneHourSent`).set(true);
          }
        }

        // 3. Exact Time (FIX 3: Limit to 10-minute window to avoid old spam on restart)
        if (!r.exactSent && diff >= 0 && diff < 10 * 60 * 1000) {
          await sendLine(lineUserId, `🔔 時間になりました:\n${r.text}`);
          await db.ref(`reminders/${safeEmail}/${reminderId}/exactSent`).set(true);
        }
      }
    } catch (err) {
      console.error(`Error processing reminders for ${safeEmail}:`, err);
    }
  }
});

/* =========================
   API ROUTES
========================= */

app.post("/api/request-line-token", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  pendingLinks.set(code, { email, expires: Date.now() + 5 * 60 * 1000 });
  res.json({ code });
});

// FIX 1: Strict check for event.message.type
app.post("/line/webhook", async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(401);
  const event = req.body.events?.[0];
  
  // Guard against non-text or empty events
  if (!event || event.type !== "message" || event.message.type !== "text") {
    return res.sendStatus(200);
  }

  const text = event.message.text.trim();
  const lineUserId = event.source.userId;

  if (text.toUpperCase().startsWith("LINK ")) {
    const code = text.replace(/LINK /i, "").trim();
    const record = pendingLinks.get(code);

    if (record && Date.now() < record.expires) {
      const safeEmail = record.email.replace(/\./g, "_");
      await db.ref(`line_links/${safeEmail}`).set({ lineUserId, linkedAt: Date.now() });
      pendingLinks.delete(code);
      await reply(event.replyToken, `✅ 連携完了しました！\n登録メール: ${record.email}`);
    } else {
      await reply(event.replyToken, "❌ 無効または期限切れのコードです。");
    }
  }
  res.sendStatus(200);
});

app.post("/api/chat", async (req, res) => {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("*", (req, res) => res.sendFile(path.join(process.cwd(), "public", "index.html")));

app.listen(PORT, () => console.log(`🚀 SUZI Production Server on port ${PORT}`));