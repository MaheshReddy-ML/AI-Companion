import Chat from "../models/Chat.js";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.0-flash";
const MAX_HISTORY_MESSAGES = 16;

const SYSTEM_PROMPT =
  "You are AI Companion, a practical and supportive assistant. Keep responses concise, clear, and actionable.";

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const role = item.role === "assistant" ? "assistant" : "user";
      const content = typeof item.content === "string" ? item.content.trim() : "";

      if (!content) {
        return null;
      }

      return { role, content };
    })
    .filter(Boolean)
    .slice(-MAX_HISTORY_MESSAGES);
}

function buildGeminiContents(history, message) {
  const historyContents = history.map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }],
  }));

  return [...historyContents, { role: "user", parts: [{ text: message }] }];
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

async function getGeminiReply({ apiKey, model, message, history }) {
  if (typeof fetch !== "function") {
    throw new Error("Server runtime does not support fetch for Gemini requests.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const endpoint = `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: buildGeminiContents(history, message),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = `Gemini request failed with status ${response.status}`;

      try {
        const errorData = await response.json();
        errorMessage = errorData?.error?.message || errorData?.message || errorMessage;
      } catch {
        // Keep default error message when the body is not JSON
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    const content = extractGeminiText(data);

    if (!content) {
      throw new Error("Gemini returned an empty response.");
    }

    return content;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Gemini request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ✅ 1. Send Message
export const sendMessage = async (req, res) => {
  const { message, apiKey, model, history } = req.body;
  const trimmedMessage = typeof message === "string" ? message.trim() : "";
  const trimmedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";

  if (!trimmedMessage) {
    return res.status(400).json({ message: "Message is required" });
  }

  if (!trimmedApiKey) {
    return res.status(400).json({ message: "Gemini API key is required." });
  }

  const resolvedModel = typeof model === "string" && model.trim() ? model.trim() : DEFAULT_MODEL;
  const normalizedHistory = normalizeHistory(history);

  try {
    // Save user message
    const userMessage = await Chat.create({
      user: req.user._id, // Assumes req.user is set by auth middleware
      sender: "user",
      message: trimmedMessage,
    });

    let aiResponseText = "";

    try {
      aiResponseText = await getGeminiReply({
        apiKey: trimmedApiKey,
        model: resolvedModel,
        message: trimmedMessage,
        history: normalizedHistory,
      });
    } catch (error) {
      return res.status(502).json({ message: error.message || "Failed to get response from Gemini." });
    }

    const aiMessage = await Chat.create({
      user: req.user._id,
      sender: "ai",
      message: aiResponseText,
    });

    res.status(201).json({
      userMessage,
      aiMessage,
      model: resolvedModel,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to send message", error: error.message });
  }
};

// ✅ 2. Get Chat History
export const getChats = async (req, res) => {
  try {
    const chats = await Chat.find({ user: req.user._id }).sort({ createdAt: 1 });
    res.json(chats);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch chats", error: error.message });
  }
};
