// api/webhook.js
// Vercel Serverless Function — Telegram Webhook Handler
// Menerima update dari Telegram, memproses pesan & callback query
// Menulis log ke Google Sheets via Apps Script

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL; // URL Apps Script Web App
const CHAT_ID = process.env.CHAT_ID;

const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ============================================================
// ENTRY POINT
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Habit Tracker aktif." });
  }

  try {
    const update = req.body;
    await handleUpdate(update);
  } catch (err) {
    console.error("Handler error:", err);
  }

  return res.status(200).json({ ok: true });
}

// ============================================================
// ROUTER UTAMA
// ============================================================

async function handleUpdate(update) {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
  } else if (update.message?.text) {
    await handleMessage(update.message);
  }
}

// ============================================================
// HANDLE PESAN TEKS
// ============================================================

async function handleMessage(message) {
  const chatId = message.chat.id.toString();
  const text   = message.text.trim();

  if (text === "/start" || text === "/menu") {
    await sendMainMenu(chatId);
  } else if (text === "/status") {
    await fetchAndSend(chatId, "status");
  } else if (text === "/streak") {
    await fetchAndSend(chatId, "streak");
  } else if (text === "/habits") {
    await fetchAndSend(chatId, "habits");
  } else if (text === "/laporan") {
    await fetchAndSend(chatId, "laporan");
  } else if (text.startsWith("/tambah ")) {
    const input = text.replace("/tambah ", "").trim();
    await fetchAndSend(chatId, "tambah", { input });
  } else {
    await sendMessage(chatId,
      "Perintah tidak dikenal 🤔\n\nKetik /menu untuk melihat semua opsi."
    );
  }
}

// ============================================================
// HANDLE CALLBACK QUERY (Tombol ✅/❌)
// ============================================================

async function handleCallbackQuery(query) {
  const chatId    = query.message.chat.id.toString();
  const messageId = query.message.message_id;
  const data      = query.data;

  // Jawab callback agar loading spinner hilang
  await answerCallbackQuery(query.id);

  if (data.startsWith("LOG:")) {
    const [, habitId, status, date] = data.split(":");

    // Kirim ke Apps Script untuk dicatat ke Sheets
    await callAppsScript("log", { habitId, status, date });

    const emoji = status === "done" ? "✅" : "❌";
    const text  = status === "done"
      ? `${emoji} Tercatat! Semoga berkah.`
      : `${emoji} Dilewati. Besok lebih baik, insyaAllah.`;

    await editMessage(chatId, messageId, text, []);
  }
}

// ============================================================
// KOMUNIKASI DENGAN APPS SCRIPT
// ============================================================

async function fetchAndSend(chatId, action, params = {}) {
  try {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("chatId", chatId);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
    });

    // Apps Script mengirim balik pesan via Telegram langsung
    // jadi kita tidak perlu parse response-nya
  } catch (err) {
    console.error("fetchAndSend error:", err);
    await sendMessage(chatId, "Terjadi kesalahan. Coba lagi sebentar.");
  }
}

async function callAppsScript(action, params = {}) {
  try {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
    });
  } catch (err) {
    console.error("callAppsScript error:", err);
  }
}

// ============================================================
// MENU UTAMA (dihandle di Vercel langsung, tanpa Apps Script)
// ============================================================

async function sendMainMenu(chatId) {
  const text =
    `🌟 *Habit Tracker — Ahmad Almuhajir*\n\n` +
    `Assalamu'alaikum! Pilih perintah:\n\n` +
    `📊 /status — Status habit hari ini\n` +
    `🔥 /streak — Streak semua habit\n` +
    `📋 /habits — Daftar habit aktif\n` +
    `📈 /laporan — Laporan mingguan\n` +
    `➕ /tambah — Tambah habit baru\n\n` +
    `_Reminder dikirim otomatis sesuai jadwal shalat._`;

  await sendMessage(chatId, text);
}

// ============================================================
// TELEGRAM API
// ============================================================

async function sendMessage(chatId, text, replyMarkup) {
  const body = {
    chat_id:    chatId,
    text:       text,
    parse_mode: "Markdown",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  await fetch(`${BASE_URL}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

async function editMessage(chatId, messageId, text, inlineKeyboard) {
  await fetch(`${BASE_URL}/editMessageText`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:      chatId,
      message_id:   messageId,
      text:         text,
      parse_mode:   "Markdown",
      reply_markup: { inline_keyboard: inlineKeyboard },
    }),
  });
}

async function answerCallbackQuery(queryId) {
  await fetch(`${BASE_URL}/answerCallbackQuery`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: queryId }),
  });
}
