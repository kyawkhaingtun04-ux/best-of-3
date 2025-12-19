import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import admin from "firebase-admin";
import cron from "node-cron";

/* =========================
   ENV & SAFETY CHECKS
========================= */
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT env var is missing");
}
if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  console.warn("⚠️ LINE_CHANNEL_ACCESS_TOKEN is missing");
}
if (!process.env.LINE_CHANNEL_SECRET) {
  console.warn("⚠️ LINE_CHANNEL_SECRET is missing");
}
if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️ GEMINI_API_KEY is missing");
}

/* =========================
   FIREBASE INIT
========================= */
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://suzi-831a8-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = admin.database();

/* =========================
   APP SETUP
========================= */
const app = express();
const PORT = process.env.PORT || 3000;

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_SECRET = process.env.LINE_CHANNEL_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const pendingLinks = new Map();

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.static(path.join(process.cwd(), "public")));
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

/* =========================
   HEALTH CHECK (RENDER NEEDS THIS)
========================= */
app.get("/", (req, res) => {
  res.status(200).send("SUZI server is running");
});

/* =========================
   LINE HELPERS
========================= */
async function sendLine(lineUserId, text) {
  if (!LINE_TOKEN) return;

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text }],
      }),
    });

    if (!res.ok) {
      console.error("LINE API Error:", await res.text());
    }
  } catch (err) {
    console.error("❌ LINE push error:", err);
  }
}

async function reply(replyToken, text) {
  if (!LINE_TOKEN) return;

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

function verifySignature(req) {
  if (!LINE_SECRET) return false;
  const signature = req.headers["x-line-signature"];
  const hash = crypto
    .createHmac("sha256", LINE_SECRET)
    .update(req.rawBody)
    .digest("base64");
  return hash === signature;
}

/* =========================
   API ROUTES
========================= */
app.post("/api/request-line-token", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  pendingLinks.set(code, {
    email,
    expires: Date.now() + 5 * 60 * 1000,
  });

  res.json({ code });
});

app.post("/line/webhook", async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(401);

  const event = req.body.events?.[0];
  if (
    !event ||
    event.type !== "message" ||
    event.message.type !== "text"
  ) {
    return res.sendStatus(200);
  }

  const text = event.message.text.trim();
  const lineUserId = event.source.userId;

  if (text.toUpperCase().startsWith("LINK ")) {
    const code = text.replace(/LINK /i, "").trim();
    const record = pendingLinks.get(code);

    if (record && Date.now() < record.expires) {
      const safeEmail = record.email.replace(/\./g, "_");
      await db.ref(`line_links/${safeEmail}`).set({
        lineUserId,
        linkedAt: Date.now(),
      });
      pendingLinks.delete(code);
      await reply(
        event.replyToken,
        `✅ 連携完了しました！\n登録メール: ${record.email}`
      );
    } else {
      await reply(event.replyToken, "❌ 無効または期限切れのコードです。");
    }
  }

  res.sendStatus(200);
});

app.post("/api/chat", async (req, res) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   SPA FALLBACK
========================= */
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

/* =========================
   START SERVER FIRST (IMPORTANT)
========================= */
app.listen(PORT, () => {
  console.log(`🚀 SUZI Production Server on port ${PORT}`);
});

/* =========================
   CRON (DELAYED START – RENDER SAFE)
========================= */
setTimeout(() => {
  cron.schedule("* * * * *", async () => {
    console.log("⏰ Cron check started...");

    // cleanup expired link codes
    for (const [code, record] of pendingLinks) {
      if (Date.now() > record.expires) pendingLinks.delete(code);
    }

    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
    );

    const snapshot = await db.ref("reminders").get();
    if (!snapshot.exists()) return;

    const remindersByUser = snapshot.val();

    for (const safeEmail in remindersByUser) {
      const reminders = remindersByUser[safeEmail];
      const linkSnap = await db.ref(`line_links/${safeEmail}`).get();
      if (!linkSnap.exists()) continue;

      const { lineUserId } = linkSnap.val();

      for (const id in reminders) {
        const r = reminders[id];
        const eventTime = new Date(r.timeISO);
        const diff = now - eventTime;

        if (r.morning && !r.morningSent) {
          const m = new Date(eventTime);
          m.setHours(8, 0, 0, 0);
          if (now >= m) {
            await sendLine(lineUserId, `🌅 今日の予定:\n${r.text}`);
            await db.ref(`reminders/${safeEmail}/${id}/morningSent`).set(true);
          }
        }

        if (r.oneHour && !r.oneHourSent) {
          const h = new Date(eventTime.getTime() - 60 * 60 * 1000);
          if (now >= h) {
            await sendLine(lineUserId, `⏰ 1時間前です:\n${r.text}`);
            await db.ref(`reminders/${safeEmail}/${id}/oneHourSent`).set(true);
          }
        }

        if (!r.exactSent && diff >= 0 && diff < 10 * 60 * 1000) {
          await sendLine(lineUserId, `🔔 時間になりました:\n${r.text}`);
          await db.ref(`reminders/${safeEmail}/${id}/exactSent`).set(true);
        }
      }
    }
  });
}, 5000);
