const { Resend } = require('resend');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const twilio = require('twilio');

// Initialize clients lazily (only when keys are present)
let resend, telegram, twilioClient;

function getResend() {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

function getTelegram() {
  if (!telegram && process.env.TELEGRAM_BOT_TOKEN) {
    telegram = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  }
  return telegram;
}

function getTwilio() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

// ── Email via Resend ─────────────────────────────────
async function sendEmail({ to, subject, html }) {
  const client = getResend();
  if (!client) {
    console.warn('[Notifications] RESEND_API_KEY not set — skipping email');
    return { skipped: true };
  }
  try {
    const result = await client.emails.send({
      from: 'CivicShield AI <alerts@civicshield.ai>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });
    return result;
  } catch (e) {
    console.error('[Notifications] Email send failed:', e.message);
    throw e;
  }
}

// ── Telegram ─────────────────────────────────────────
async function sendTelegram(chatId, message) {
  const bot = getTelegram();
  if (!bot) {
    console.warn('[Notifications] TELEGRAM_BOT_TOKEN not set — skipping telegram');
    return { skipped: true };
  }
  try {
    return await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('[Notifications] Telegram send failed:', e.message);
    throw e;
  }
}

// ── WhatsApp via Twilio ──────────────────────────────
async function sendWhatsApp(to, message) {
  const client = getTwilio();
  if (!client) {
    console.warn('[Notifications] TWILIO credentials not set — skipping WhatsApp');
    return { skipped: true };
  }
  try {
    const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // default twilio sandbox number
    
    // Ensure the to number has the 'whatsapp:' prefix
    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    
    const result = await client.messages.create({
      body: message,
      from,
      to: toFormatted
    });
    return result;
  } catch (e) {
    console.error('[Notifications] WhatsApp send failed:', e.message);
    throw e;
  }
}

// ── LibreTranslate ────────────────────────────────────
async function translateText(text, targetLang, sourceLang = 'en') {
  const baseUrl = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000';
  try {
    const { data } = await axios.post(`${baseUrl}/translate`, {
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text',
    }, { timeout: 5000 });
    return data.translatedText;
  } catch (e) {
    console.warn(`[Notifications] Translation to ${targetLang} failed:`, e.message);
    return text; // fallback to original text
  }
}

// ── Alert Router ──────────────────────────────────────
const SUPPORTED_LANGUAGES = ['hi', 'ta', 'te', 'bn', 'gu', 'mr', 'pa'];

/**
 * Route an alert through all specified channels.
 * @param {Object} alert - Alert object from DB
 * @param {string[]} channels - ['email', 'telegram', 'web_push']
 * @param {Object} recipients - { emails: [], telegramChatIds: [] }
 */
async function routeAlert(alert, channels = [], recipients = {}) {
  const results = [];

  const alertHtml = `
    <h2 style="color:${alert.severity === 'Critical' ? '#dc2626' : '#f59e0b'}">
      🚨 ${alert.title}
    </h2>
    <p>${alert.body}</p>
    <p><strong>Severity:</strong> ${alert.severity}</p>
    <p><em>CivicShield AI — Intelligent Disaster Management</em></p>
  `;

  if (channels.includes('email') && recipients.emails?.length > 0) {
    for (const email of recipients.emails) {
      try {
        const res = await sendEmail({
          to: email,
          subject: `[${alert.severity}] ${alert.title}`,
          html: alertHtml,
        });
        results.push({ channel: 'email', recipient: email, success: true, data: res });
      } catch (e) {
        results.push({ channel: 'email', recipient: email, success: false, error: e.message });
      }
    }
  }

  if (channels.includes('telegram') && recipients.telegramChatIds?.length > 0) {
    const telegramMsg = `🚨 <b>[${alert.severity}] ${alert.title}</b>\n\n${alert.body}`;
    for (const chatId of recipients.telegramChatIds) {
      try {
        await sendTelegram(chatId, telegramMsg);
        results.push({ channel: 'telegram', recipient: chatId, success: true });
      } catch (e) {
        results.push({ channel: 'telegram', recipient: chatId, success: false, error: e.message });
      }
    }
  }

  if (channels.includes('whatsapp') && recipients.whatsappNumbers?.length > 0) {
    const waMsg = `🚨 *[${alert.severity}] ${alert.title}*\n\n${alert.body}\n\n_CivicShield AI_`;
    for (const num of recipients.whatsappNumbers) {
      try {
        const res = await sendWhatsApp(num, waMsg);
        results.push({ channel: 'whatsapp', recipient: num, success: true, data: res.sid });
      } catch (e) {
        results.push({ channel: 'whatsapp', recipient: num, success: false, error: e.message });
      }
    }
  }

  // Multilingual translation variants
  if (channels.includes('multilingual')) {
    const translations = await Promise.allSettled(
      SUPPORTED_LANGUAGES.map(async (lang) => ({
        lang,
        title: await translateText(alert.title, lang),
        body: await translateText(alert.body, lang),
      }))
    );
    results.push({
      channel: 'multilingual',
      translations: translations.map(t => t.status === 'fulfilled' ? t.value : null).filter(Boolean),
    });
  }

  return results;
}

module.exports = { sendEmail, sendTelegram, sendWhatsApp, translateText, routeAlert };
