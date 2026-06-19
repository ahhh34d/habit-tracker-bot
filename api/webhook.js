// api/webhook.js — v2 (fix timeout)
// Strategi: balas Telegram DULU via editMessage, lalu kirim log ke Apps Script
// tanpa menunggu response (fire and forget)

const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const BASE_URL        = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Habit Tracker aktif." });
  }

  try {
    const update = req.body;

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.message?.text) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error("Handler error:", err);
  }

  return res.status(200).json({ ok: true });
}

// ============================================================
// HANDLE TOMBOL INLINE ✅/❌
// ============================================================

async function handleCallbackQuery(query) {
  const chatId    = query.message.chat.id.toString();
  const messageId = query.message.message_id;
  const data      = query.data;

  // 1. Jawab callback query dulu — hilangkan loading spinner
  await answerCallbackQuery(query.id);

  if (!data.startsWith("LOG:")) return;

  const [, habitId, status, date] = data.split(":");
  const emoji = status === "done" ? "✅" : "❌";
  const text  = status === "done"
    ? `${emoji} Tercatat! Semoga berkah.`
    : `${emoji} Dilewati. Besok lebih baik, insyaAllah.`;

  // 2. Edit pesan Telegram DULU — user langsung dapat feedback
  await editMessage(chatId, messageId, text, []);

  // 3. Kirim log ke Apps Script SETELAH balas Telegram (fire and forget)
  // Tidak pakai await agar tidak blocking dan tidak kena timeout
  fireAndForget(`${APPS_SCRIPT_URL}?action=log&habitId=${habitId}&status=${status}&date=${date}`);
}

// ============================================================
// HANDLE PESAN TEKS
// ============================================================

async function handleMessage(message) {
  const chatId = message.chat.id.toString();
  const text   = message.text.trim();

  if (text === "/start" || text === "/menu") {
    await sendMainMenu(chatId);
    return;
  }

  // Untuk command yang butuh data dari Sheets,
  // kirim pesan "sedang memuat" dulu biar user tahu bot aktif
  const loadingMap = {
    "/status":  "📊 Memuat status hari ini...",
    "/streak":  "🔥 Menghitung streak...",
    "/habits":  "📋 Memuat daftar habit...",
    "/laporan": "📈 Membuat laporan mingguan...",
  };

  if (loadingMap[text]) {
    await sendMessage(chatId, loadingMap[text]);
    fireAndForget(`${APPS_SCRIPT_URL}?action=${text.replace("/","")}&chatId=${chatId}`);
    return;
  }

  if (text.startsWith("/tambah ")) {
    const input = encodeURIComponent(text.replace("/tambah ", "").trim());
    await sendMessage(chatId, "➕ Menambahkan habit...");
    fireAndForget(`${APPS_SCRIPT_URL}?action=tambah&chatId=${chatId}&input=${input}`);
    return;
  }

  await sendMessage(chatId,
    "Perintah tidak dikenal 🤔\n\nKetik /menu untuk melihat semua opsi."
  );
}

// ============================================================
// FIRE AND FORGET — kirim request tanpa tunggu response
// ============================================================

function fireAndForget(url) {
  fetch(url, { method: "GET", redirect: "follow" })
    .then(() => console.log("Apps Script called:", url))
    .catch(err => console.error("Apps Script error:", err));
}

// ============================================================
// MENU UTAMA
// ============================================================

async function sendMainMenu(chatId) {
  await sendMessage(chatId,
    `🌟 *Habit Tracker — Ahmad Almuhajir*\n\n` +
    `Assalamu'alaikum! Pilih perintah:\n\n` +
    `📊 /status — Status habit hari ini\n` +
    `🔥 /streak — Streak semua habit\n` +
    `📋 /habits — Daftar habit aktif\n` +
    `📈 /laporan — Laporan mingguan\n` +
    `➕ /tambah NamaHabit|Kategori|Waktu\n\n` +
    `_Reminder dikirim otomatis sesuai jadwal shalat._`
  );
}

// ============================================================
// TELEGRAM API
// ============================================================

async function sendMessage(chatId, text) {
  await fetch(`${BASE_URL}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:    chatId,
      text:       text,
      parse_mode: "Markdown",
    }),
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
