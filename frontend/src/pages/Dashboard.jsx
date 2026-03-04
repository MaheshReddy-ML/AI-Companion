import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ThemeContext } from "../context/ThemeContext";
import PremiumBanner from "../components/common/PremiumBanner";
import { sendChatMessage } from "../services/chatService";

const CHAT_STORAGE_VERSION = 1;
const CHAT_STORAGE_PREFIX = "ai-companion:dashboard-chats";
const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_DEEPSEEK_API_KEY || "";

const quickPrompts = [
  "Plan a focused 2-hour coding sprint for tonight.",
  "Give me a calm check-in routine before sleep.",
  "Summarize my priorities for this week in 5 bullets.",
  "Help me reframe stress into actionable steps.",
];
const UPGRADE_VERSION = "Upgrade v2.2";

function createSeedChats() {
  return [
    {
      id: "chat-welcome",
      title: "Welcome session",
      updatedAt: new Date(Date.now() - 1000 * 60 * 19).toISOString(),
      pinned: false,
      messages: [
        {
          id: "msg-a-1",
          role: "assistant",
          content: "Welcome back. Tell me what kind of support you need today and I will keep it practical.",
          timestamp: new Date(Date.now() - 1000 * 60 * 19).toISOString(),
        },
      ],
    },
    {
      id: "chat-focus",
      title: "Focus routine",
      updatedAt: new Date(Date.now() - 1000 * 60 * 160).toISOString(),
      pinned: false,
      messages: [
        {
          id: "msg-b-1",
          role: "user",
          content: "I need help avoiding distractions when I code after work.",
          timestamp: new Date(Date.now() - 1000 * 60 * 165).toISOString(),
        },
        {
          id: "msg-b-2",
          role: "assistant",
          content:
            "Use 45-minute focus blocks, one clear task per block, and a hard stop with a short reflection note.",
          timestamp: new Date(Date.now() - 1000 * 60 * 160).toISOString(),
        },
      ],
    },
  ];
}

function createChatTitle(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "New conversation";
  }
  return cleaned.length > 52 ? `${cleaned.slice(0, 52)}...` : cleaned;
}

function formatSidebarTime(isoTime) {
  const messageTime = new Date(isoTime);
  const now = new Date();
  const isToday = messageTime.toDateString() === now.toDateString();

  if (isToday) {
    return messageTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (messageTime.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return messageTime.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(isoTime) {
  return new Date(isoTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getUserStorageSuffix(user) {
  const userKey = user?.id || user?._id || user?.email || user?.username || user?.name || "guest";
  return String(userKey).toLowerCase();
}

function getStorageKeyForUser(user) {
  return `${CHAT_STORAGE_PREFIX}:${getUserStorageSuffix(user)}`;
}

function sanitizeMessage(rawMessage, fallbackId) {
  if (!rawMessage || typeof rawMessage !== "object") {
    return null;
  }

  const content = typeof rawMessage.content === "string" ? rawMessage.content.trim() : "";
  if (!content) {
    return null;
  }

  const role = rawMessage.role === "assistant" ? "assistant" : "user";
  const timestamp =
    typeof rawMessage.timestamp === "string" && !Number.isNaN(Date.parse(rawMessage.timestamp))
      ? rawMessage.timestamp
      : new Date().toISOString();

  return {
    id: typeof rawMessage.id === "string" ? rawMessage.id : fallbackId,
    role,
    content,
    attachmentName: typeof rawMessage.attachmentName === "string" ? rawMessage.attachmentName : undefined,
    timestamp,
  };
}

function sanitizeChat(rawChat, index) {
  if (!rawChat || typeof rawChat !== "object") {
    return null;
  }

  const chatId = typeof rawChat.id === "string" && rawChat.id.trim() ? rawChat.id : `chat-restored-${index + 1}`;
  const messages = Array.isArray(rawChat.messages)
    ? rawChat.messages
        .map((message, messageIndex) => sanitizeMessage(message, `${chatId}-msg-${messageIndex + 1}`))
        .filter(Boolean)
    : [];

  const updatedAt =
    typeof rawChat.updatedAt === "string" && !Number.isNaN(Date.parse(rawChat.updatedAt))
      ? rawChat.updatedAt
      : messages[messages.length - 1]?.timestamp || new Date().toISOString();

  return {
    id: chatId,
    title:
      typeof rawChat.title === "string" && rawChat.title.trim()
        ? rawChat.title.trim()
        : createChatTitle(messages[0]?.content || "New conversation"),
    updatedAt,
    pinned: Boolean(rawChat.pinned),
    messages,
  };
}

function getHighestCounter(chats) {
  let highest = 0;
  const updateHighest = (id) => {
    if (typeof id !== "string") {
      return;
    }
    const match = id.match(/-(\d+)$/);
    if (!match) {
      return;
    }
    highest = Math.max(highest, Number(match[1]));
  };

  chats.forEach((chat) => {
    updateHighest(chat.id);
    chat.messages.forEach((message) => updateHighest(message.id));
  });

  return highest;
}

function loadStoredState(storageKey) {
  const seedChats = createSeedChats();

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return {
        chats: seedChats,
        activeChatId: seedChats[0]?.id ?? null,
      };
    }

    const parsed = JSON.parse(raw);
    const normalizedChats = Array.isArray(parsed?.chats)
      ? parsed.chats.map((chat, index) => sanitizeChat(chat, index)).filter(Boolean)
      : [];

    if (!normalizedChats.length) {
      if (parsed?.initialized) {
        return { chats: [], activeChatId: null };
      }
      return {
        chats: seedChats,
        activeChatId: seedChats[0]?.id ?? null,
      };
    }

    const preferredActiveId = typeof parsed?.activeChatId === "string" ? parsed.activeChatId : null;
    const resolvedActiveId = normalizedChats.some((chat) => chat.id === preferredActiveId)
      ? preferredActiveId
      : normalizedChats[0].id;

    return {
      chats: normalizedChats,
      activeChatId: resolvedActiveId,
    };
  } catch (error) {
    console.error("Failed to restore chats from local storage", error);
    return {
      chats: seedChats,
      activeChatId: seedChats[0]?.id ?? null,
    };
  }
}

function buildShareText(chat, displayName) {
  if (!chat || !chat.messages?.length) {
    return "";
  }

  const transcript = chat.messages
    .map((message) => {
      const speaker = message.role === "assistant" ? "AI Companion" : displayName;
      const attachment = message.attachmentName ? ` (Attachment: ${message.attachmentName})` : "";
      return `${speaker}: ${message.content}${attachment}`;
    })
    .join("\n\n");

  return `AI Companion conversation: ${chat.title}\n\n${transcript}`;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.2.3 11.8c0 2.1.6 4.1 1.6 5.9L0 24l6.5-1.9a11.7 11.7 0 0 0 5.6 1.4h.1c6.5 0 11.8-5.2 11.8-11.8 0-3.1-1.2-6-3.5-8.2Zm-8.4 18c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.9 1.1 1.1-3.8-.3-.4a9.6 9.6 0 0 1-1.5-5.1c0-5.4 4.4-9.7 9.8-9.7a9.8 9.8 0 0 1 9.8 9.7c0 5.4-4.4 9.8-9.7 9.8Zm5.4-7.3c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.8.2-.2.3-.8 1-1 1.1-.2.2-.4.2-.8 0a8 8 0 0 1-2.4-1.5 9 9 0 0 1-1.6-2c-.2-.3 0-.5.1-.7l.4-.5.3-.5c.1-.2 0-.4 0-.6l-1-2.4c-.2-.5-.5-.5-.8-.5h-.7c-.2 0-.6.1-.9.4-.3.4-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.3 3.4 5.5 4.8.8.4 1.5.6 2 .8a4.8 4.8 0 0 0 2.2.1c.7-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4 0-.1-.3-.2-.6-.4Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M14.3 10.5 22.4 1h-1.9l-7 8.2L7.8 1H1.2l8.4 12.2L1.2 23h1.9l7.3-8.5 5.8 8.5h6.6l-8.5-12.5Zm-2.9 3.4-.8-1.1L4.1 3.5h3l5.2 7.2.8 1.1 6.8 9.4h-3l-5.5-7.3Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12a3 3 0 1 0-2.7-4.2m0 8.4A3 3 0 1 0 7.5 12m9 6a3 3 0 1 0 2.7-4.2m-2.7 4.2v0m0-12v0M8.7 10.8l6.6-3.6m-6.6 6 6.6 3.6" />
    </svg>
  );
}

function PinIcon({ pinned }) {
  if (pinned) {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M8.8 2.8a1 1 0 0 1 .7-.3h5a1 1 0 0 1 .9 1.5l-1.3 2.2v4.2l2 2.6a1 1 0 0 1-.8 1.6H13v7a1 1 0 0 1-2 0v-7H8.2a1 1 0 0 1-.8-1.6l2-2.6V6.2L8 4a1 1 0 0 1 .8-1.2Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.8 2.8a1 1 0 0 1 .7-.3h5a1 1 0 0 1 .9 1.5l-1.3 2.2v4.2l2 2.6a1 1 0 0 1-.8 1.6H13v7a1 1 0 0 1-2 0v-7H8.2a1 1 0 0 1-.8-1.6l2-2.6V6.2L8 4a1 1 0 0 1 .8-1.2Z"
      />
    </svg>
  );
}

function ChatShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12a3 3 0 1 0-2.7-4.2m0 8.4A3 3 0 1 0 7.5 12m9 6a3 3 0 1 0 2.7-4.2m-2.7 4.2v0m0-12v0M8.7 10.8l6.6-3.6m-6.6 6 6.6 3.6" />
    </svg>
  );
}

export default function Dashboard() {
  const auth = useContext(AuthContext);
  const themeCtx = useContext(ThemeContext);
  const navigate = useNavigate();

  const user = auth?.user;
  const setUser = auth?.setUser ?? (() => {});
  const theme = themeCtx?.theme ?? "system";
  const setTheme = themeCtx?.setTheme ?? (() => {});

  const storageKey = useMemo(() => getStorageKeyForUser(user), [user]);
  const restoredState = useMemo(() => loadStoredState(storageKey), [storageKey]);
  const [chats, setChats] = useState(() => restoredState.chats);
  const [activeChatId, setActiveChatId] = useState(() => restoredState.activeChatId);
  const [draft, setDraft] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);

  const profileRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesRef = useRef(null);
  const idCounterRef = useRef(getHighestCounter(restoredState.chats));

  const displayName = user?.name || user?.username || user?.email?.split("@")[0] || "Friend";

  const orderedChats = useMemo(
    () => [...chats].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [chats],
  );
  const pinnedChats = useMemo(() => orderedChats.filter((chat) => chat.pinned), [orderedChats]);
  const regularChats = useMemo(() => orderedChats.filter((chat) => !chat.pinned), [orderedChats]);

  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId) ?? null, [chats, activeChatId]);
  const activeMessages = activeChat?.messages ?? [];
  const canSend = Boolean(draft.trim() || selectedFile);
  const totalMessages = useMemo(
    () => chats.reduce((accumulator, chat) => accumulator + chat.messages.length, 0),
    [chats],
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: CHAT_STORAGE_VERSION,
          initialized: true,
          chats,
          activeChatId,
        }),
      );
    } catch (error) {
      console.error("Failed to save chats to local storage", error);
    }
  }, [activeChatId, chats, storageKey]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTo({
        top: messagesRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [activeChatId, activeMessages.length, isThinking]);

  useEffect(() => {
    if (!shareNotice) {
      return undefined;
    }

    const timerId = window.setTimeout(() => setShareNotice(""), 2600);
    return () => window.clearTimeout(timerId);
  }, [shareNotice]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  };

  const nextId = (prefix) => {
    idCounterRef.current += 1;
    return `${prefix}-${idCounterRef.current}`;
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setUser(null);
    navigate("/login");
  };

  const handleNewChat = () => {
    const newChat = {
      id: nextId("chat"),
      title: "New conversation",
      updatedAt: new Date().toISOString(),
      pinned: false,
      messages: [],
    };

    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setDraft("");
    setSelectedFile(null);
    setIsMobileSidebarOpen(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleOpenChat = (chatId) => {
    setActiveChatId(chatId);
    setIsMobileSidebarOpen(false);
  };

  const handleDeleteChat = (chatId, event) => {
    event.stopPropagation();

    setChats((prevChats) => {
      const remaining = prevChats.filter((chat) => chat.id !== chatId);

      if (chatId === activeChatId) {
        const nextActive = remaining.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]?.id ?? null;
        setActiveChatId(nextActive);
      }

      return remaining;
    });
  };

  const handleTogglePin = (chatId, event) => {
    event?.stopPropagation();
    setChats((prevChats) =>
      prevChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              pinned: !chat.pinned,
            }
          : chat,
      ),
    );
  };

  const handleDraftInput = (event) => {
    setDraft(event.target.value);
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 190)}px`;
  };

  const handleFileSelection = (event) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    event.target.value = "";
  };

  const submitMessage = async (promptOverride) => {
    if (isThinking) {
      return;
    }

    const messageText = (promptOverride ?? draft).trim();

    if (!messageText && !selectedFile) {
      return;
    }

    const trimmedApiKey = GEMINI_API_KEY.trim();
    if (!trimmedApiKey) {
      setShareNotice("AI service is not configured.");
      return;
    }

    const attachmentName = selectedFile?.name || null;
    const outgoingContent = messageText || `Shared file: ${attachmentName}`;
    const timestamp = new Date().toISOString();

    const userMessage = {
      id: nextId("msg"),
      role: "user",
      content: outgoingContent,
      attachmentName,
      timestamp,
    };

    let conversationId = activeChatId;
    const existingConversation = conversationId ? chats.find((chat) => chat.id === conversationId) ?? null : null;

    const history = (existingConversation?.messages ?? [])
      .filter((entry) => typeof entry?.content === "string" && entry.content.trim())
      .slice(-16)
      .map((entry) => ({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: entry.content,
      }));

    if (!existingConversation) {
      const newChat = {
        id: nextId("chat"),
        title: createChatTitle(outgoingContent || attachmentName || "New conversation"),
        updatedAt: timestamp,
        pinned: false,
        messages: [userMessage],
      };

      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      conversationId = newChat.id;
    } else {
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== conversationId) {
            return chat;
          }

          const shouldRetitle = chat.messages.length === 0 || chat.title === "New conversation";

          return {
            ...chat,
            title: shouldRetitle
              ? createChatTitle(outgoingContent || attachmentName || "New conversation")
              : chat.title,
            updatedAt: timestamp,
            messages: [...chat.messages, userMessage],
          };
        }),
      );
    }

    setDraft("");
    setSelectedFile(null);
    setIsThinking(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const response = await sendChatMessage(outgoingContent, {
        apiKey: trimmedApiKey,
        model: GEMINI_DEFAULT_MODEL,
        history,
      });

      const assistantText =
        typeof response?.aiMessage?.message === "string" ? response.aiMessage.message.trim() : "";

      if (!assistantText) {
        throw new Error("Gemini returned an empty response.");
      }

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== conversationId) {
            return chat;
          }

          const assistantMessage = {
            id: nextId("msg"),
            role: "assistant",
            content: assistantText,
            timestamp: new Date().toISOString(),
          };

          return {
            ...chat,
            updatedAt: assistantMessage.timestamp,
            messages: [...chat.messages, assistantMessage],
          };
        }),
      );
    } catch (error) {
      let errorMessage =
        error?.response?.data?.message || error?.message || "Failed to get a response from Gemini.";
      if (/api key/i.test(errorMessage)) {
        errorMessage = "AI service is not configured.";
      }

      setShareNotice(errorMessage);
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== conversationId) {
            return chat;
          }

          const assistantMessage = {
            id: nextId("msg"),
            role: "assistant",
            content: `I could not complete that request. ${errorMessage}`,
            timestamp: new Date().toISOString(),
          };

          return {
            ...chat,
            updatedAt: assistantMessage.timestamp,
            messages: [...chat.messages, assistantMessage],
          };
        }),
      );
    } finally {
      setIsThinking(false);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  };

  const openShareLink = (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const getShareTextForChat = (chat) => buildShareText(chat, displayName);

  const shareChat = async (chat, channel) => {
    if (!chat) {
      setShareNotice("No active chat selected.");
      return;
    }

    const text =
      chat.messages?.length > 0
        ? getShareTextForChat(chat)
        : `AI Companion conversation: ${chat.title || "New conversation"}\n\nNo messages yet.`;

    if (channel === "whatsapp") {
      openShareLink(`https://wa.me/?text=${encodeURIComponent(text)}`);
      setShareNotice(`Shared "${chat.title}" to WhatsApp.`);
      return;
    }

    if (channel === "x") {
      const compactText = text.replace(/\s+/g, " ").trim();
      const xText = compactText.length > 260 ? `${compactText.slice(0, 257)}...` : compactText;
      openShareLink(`https://x.com/intent/tweet?text=${encodeURIComponent(xText)}`);
      setShareNotice(`Shared "${chat.title}" to X.`);
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: chat.title || "AI Companion conversation",
          text,
        });
        setShareNotice("Shared successfully.");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareNotice(`Copied "${chat.title}" to clipboard.`);
        return;
      }

      setShareNotice("Sharing is not supported on this device.");
    } catch (error) {
      if (error?.name !== "AbortError") {
        setShareNotice("Unable to share right now.");
      }
    }
  };

  const handleWhatsAppShare = () => {
    shareChat(activeChat, "whatsapp");
  };

  const handleXShare = () => {
    shareChat(activeChat, "x");
  };

  const handleMoreShare = async () => {
    await shareChat(activeChat, "more");
  };

  const renderChatItem = (chat) => {
    const active = chat.id === activeChatId;

    return (
      <button
        type="button"
        key={chat.id}
        onClick={() => handleOpenChat(chat.id)}
        className={`group w-full rounded-2xl border px-3 py-3 text-left transition ${
          active
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--border-soft)] bg-[var(--glass-raised)] hover:border-[var(--accent)]"
        }`}
      >
        {isDesktopSidebarOpen ? (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{chat.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xs text-[var(--text-secondary)]">{formatSidebarTime(chat.updatedAt)}</p>
                {chat.pinned && (
                  <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                    Pinned
                  </span>
                )}
              </div>
            </div>
            <div className="invisible flex items-center gap-1 text-[var(--text-secondary)] transition group-hover:visible">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  shareChat(chat, "whatsapp");
                }}
                className="rounded-md p-1 text-[#1fa855] hover:bg-[var(--accent-soft)]"
                aria-label={`Share ${chat.title} to WhatsApp`}
                title="Share to WhatsApp"
              >
                <WhatsAppIcon />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  shareChat(chat, "x");
                }}
                className="rounded-md p-1 hover:bg-[var(--accent-soft)]"
                aria-label={`Share ${chat.title} to X`}
                title="Share to X"
              >
                <XIcon />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  shareChat(chat, "more");
                }}
                className="rounded-md p-1 hover:bg-[var(--accent-soft)]"
                aria-label={`Share ${chat.title} to more apps`}
                title="Share to more apps"
              >
                <ChatShareIcon />
              </button>
              <button
                type="button"
                onClick={(event) => handleTogglePin(chat.id, event)}
                className={`rounded-md p-1 hover:bg-[var(--accent-soft)] ${
                  chat.pinned ? "text-[var(--accent)]" : ""
                }`}
                aria-label={chat.pinned ? `Unpin ${chat.title}` : `Pin ${chat.title}`}
                title={chat.pinned ? "Unpin chat" : "Pin chat"}
              >
                <PinIcon pinned={chat.pinned} />
              </button>
              <button
                type="button"
                onClick={(event) => handleDeleteChat(chat.id, event)}
                className="rounded-md p-1 hover:bg-[var(--accent-soft)]"
                aria-label={`Delete ${chat.title}`}
                title="Delete chat"
              >
                x
              </button>
            </div>
          </div>
        ) : (
          <div className="relative text-center text-sm font-semibold">
            {chat.title.charAt(0).toUpperCase()}
            {chat.pinned && <span className="absolute -right-0.5 -top-1 h-2 w-2 rounded-full bg-[var(--accent)]" />}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="dashboard-shell relative flex h-screen overflow-hidden text-[var(--text-primary)]">
      <div className="liquid-orb liquid-orb-a" />
      <div className="liquid-orb liquid-orb-b" />
      <div className="liquid-orb liquid-orb-c" />

      {isMobileSidebarOpen && (
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] lg:hidden"
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={`glass-sidebar dashboard-sidebar fixed left-0 top-0 z-50 flex h-full flex-col overflow-hidden px-4 py-4 transition-[width,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] lg:static lg:z-10 lg:will-change-[width] ${
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${isDesktopSidebarOpen ? "w-[300px]" : "w-[92px]"}`}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsDesktopSidebarOpen((prev) => !prev)}
            className="hidden rounded-full border border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] lg:block"
          >
            {isDesktopSidebarOpen ? "Collapse" : "Expand"}
          </button>

          {isDesktopSidebarOpen ? (
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="AI Companion" className="h-7 w-7" />
              <div className="min-w-0">
                <p className="brand-title text-sm font-bold">AI Companion</p>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.11em] text-[var(--text-secondary)]">
                  {UPGRADE_VERSION}
                </p>
              </div>
            </div>
          ) : (
            <img src="/logo.svg" alt="AI Companion" className="mx-auto h-8 w-8" />
          )}
        </div>

        {isDesktopSidebarOpen && (
          <div className="dashboard-sidebar-stats mb-3 grid grid-cols-3 gap-2">
            <div className="sidebar-stat-row px-2 py-2 text-center">
              <p className="text-[11px] text-[var(--text-secondary)]">Chats</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{chats.length}</p>
            </div>
            <div className="sidebar-stat-row px-2 py-2 text-center">
              <p className="text-[11px] text-[var(--text-secondary)]">Pinned</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{pinnedChats.length}</p>
            </div>
            <div className="sidebar-stat-row px-2 py-2 text-center">
              <p className="text-[11px] text-[var(--text-secondary)]">Msgs</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{totalMessages}</p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleNewChat}
          className={`primary-cta mb-4 flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-bold shadow-sm ${
            isDesktopSidebarOpen ? "" : "px-2"
          }`}
        >
          {isDesktopSidebarOpen ? "+ New chat" : "+"}
        </button>

        {isDesktopSidebarOpen && (
          <PremiumBanner onUpgradeClick={() => setIsPremiumModalOpen(true)} />
        )}

        <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto pr-1">
          {orderedChats.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-4 text-xs text-[var(--text-secondary)]">
              No chats yet. Start a new one.
            </p>
          ) : isDesktopSidebarOpen ? (
            <>
              {pinnedChats.length > 0 && (
                <div className="sidebar-group space-y-2">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    Pinned
                  </p>
                  {pinnedChats.map((chat) => renderChatItem(chat))}
                </div>
              )}
              <div className="sidebar-group space-y-2">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Recent chats
                </p>
                {regularChats.length > 0 ? (
                  regularChats.map((chat) => renderChatItem(chat))
                ) : (
                  <p className="rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-3 text-xs text-[var(--text-secondary)]">
                    No recent chats.
                  </p>
                )}
              </div>
            </>
          ) : (
            orderedChats.map((chat) => renderChatItem(chat))
          )}
        </div>

        {isDesktopSidebarOpen && (
          <div className="mt-4 space-y-1 border-t border-[var(--border-soft)] pt-4">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
              Settings
            </p>
            <button
              type="button"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              aria-expanded={isSettingsOpen}
              className={`group w-full rounded-lg border px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)] transition ${
                isSettingsOpen
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border-soft)] bg-[var(--bg-elevated)] hover:bg-[var(--accent-soft)]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>General Settings</span>
                </div>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="m6 9 6 6 6-6"
                    className={`origin-center transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isSettingsOpen ? "rotate-180" : ""}`}
                  />
                </svg>
              </div>
            </button>

            {isSettingsOpen && (
              <div className="fade-slide-in space-y-3 rounded-xl border border-[var(--border-soft)] bg-[var(--glass-raised)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                  Chat options
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  AI provider settings are managed by the app configuration.
                </p>
              </div>
            )}

            <button
              type="button"
              className="group w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--accent-soft)]"
            >
              <div className="flex items-center gap-3">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span>Notifications</span>
              </div>
            </button>

            <button
              type="button"
              className="group w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--accent-soft)]"
            >
              <div className="flex items-center gap-3">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Privacy & Security</span>
              </div>
            </button>

            <button
              type="button"
              className="group w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--accent-soft)]"
            >
              <div className="flex items-center gap-3">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Help & Support</span>
              </div>
            </button>
          </div>
        )}
      </aside>

      <main className="dashboard-main relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="glass-header relative z-40 flex flex-wrap items-center justify-between gap-3 overflow-visible border-b border-[var(--border-soft)] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--glass-raised)] p-2 lg:hidden"
              aria-label="Open sidebar"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z" />
              </svg>
            </button>

            <span className="rounded-full border border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.11em] text-[var(--text-secondary)]">
              Companion mode
            </span>
            <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
              {UPGRADE_VERSION}
            </span>
            <div className="dashboard-active-card hidden max-w-[300px] items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-1.5 text-xs text-[var(--text-secondary)] sm:flex">
              <span className="truncate font-semibold text-[var(--text-primary)]">{activeChat?.title || "No active chat"}</span>
              <span className="text-[10px] uppercase tracking-[0.11em]">{activeChat ? formatSidebarTime(activeChat.updatedAt) : "Idle"}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPremiumModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[#0d6d9b] px-3 py-2 text-xs font-bold text-white shadow-md transition hover:shadow-lg"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Premium</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)]"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="share-action-btn text-[#1fa855]"
                aria-label="Share to WhatsApp"
                title="Share to WhatsApp"
              >
                <WhatsAppIcon />
                <span className="hidden sm:inline">WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={handleXShare}
                className="share-action-btn text-[var(--text-primary)]"
                aria-label="Share to X"
                title="Share to X"
              >
                <XIcon />
                <span className="hidden sm:inline">X</span>
              </button>
              <button
                type="button"
                onClick={handleMoreShare}
                className="share-action-btn text-[var(--text-primary)]"
                aria-label="Share to more apps"
                title="Share to more apps"
              >
                <ShareIcon />
                <span className="hidden sm:inline">More</span>
              </button>
            </div>

            <div className="relative z-[90]" ref={profileRef}>
              <button
                type="button"
                onClick={() => setIsProfileOpen((prev) => !prev)}
                className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--glass-raised)] text-sm font-bold shadow-sm"
              >
                {displayName.charAt(0).toUpperCase()}
              </button>

              {isProfileOpen && (
                <div className="fade-slide-in absolute right-0 z-[120] mt-2 w-56 rounded-2xl border border-[var(--border-soft)] bg-[var(--glass-raised)] p-3 shadow-xl backdrop-blur-xl">
                  <p className="text-sm font-bold">{displayName}</p>
                  <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{user?.email || "demo@companion"}</p>
                  <div className="my-3 h-px bg-[var(--border-soft)]" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-left text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/10"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {shareNotice && (
          <div className="px-4 pt-3 sm:px-6">
            <p className="fade-slide-in inline-flex rounded-full border border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-1 text-xs text-[var(--text-secondary)]">
              {shareNotice}
            </p>
          </div>
        )}

        <section ref={messagesRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-44 pt-6 sm:px-6 sm:pt-8">
          {activeMessages.length === 0 ? (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
              <div className="dashboard-welcome-card rounded-3xl border border-[var(--border-soft)] bg-[var(--glass-panel)] p-5 sm:p-7">
                <div className="max-w-3xl space-y-3">
                  <p className="text-sm uppercase tracking-[0.11em] text-[var(--text-secondary)]">Welcome back, {displayName}</p>
                  <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
                    What do you want to work through
                    <span className="gradient-text"> right now?</span>
                  </h1>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
                    Ask for structured planning, emotional check-ins, or quick decisions. Every chat is saved locally and stays until you delete it.
                  </p>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="dashboard-inline-stat p-3">
                    <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-secondary)]">Conversations</p>
                    <p className="mt-1 text-2xl font-bold">{chats.length}</p>
                  </div>
                  <div className="dashboard-inline-stat p-3">
                    <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-secondary)]">Pinned</p>
                    <p className="mt-1 text-2xl font-bold">{pinnedChats.length}</p>
                  </div>
                  <div className="dashboard-inline-stat p-3">
                    <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-secondary)]">Messages</p>
                    <p className="mt-1 text-2xl font-bold">{totalMessages}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submitMessage(prompt)}
                    className="feature-tile text-left text-sm font-medium"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl space-y-5">
              <div className="chat-context-row flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{activeChat?.title || "Conversation"}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {activeMessages.length} messages • updated {activeChat ? formatSidebarTime(activeChat.updatedAt) : "just now"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => activeChat && handleTogglePin(activeChat.id)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      activeChat?.pinned
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border-soft)] bg-[var(--glass-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                    }`}
                  >
                    <PinIcon pinned={Boolean(activeChat?.pinned)} />
                    {activeChat?.pinned ? "Pinned" : "Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => activeChat && shareChat(activeChat, "more")}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] bg-[var(--glass-raised)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)]"
                  >
                    <ShareIcon />
                    Share
                  </button>
                </div>
              </div>

              {activeMessages.map((message) => {
                const isUser = message.role === "user";

                return (
                  <article key={message.id} className={`fade-slide-in flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className={`message-bubble ${isUser ? "user" : "assistant"}`}>
                      <p className="whitespace-pre-wrap text-sm sm:text-[0.95rem]">{message.content}</p>
                      {message.attachmentName && (
                        <p className="mt-2 rounded-lg border border-[var(--border-soft)] bg-[var(--glass-raised)] px-2 py-1 text-xs">
                          Attachment: {message.attachmentName}
                        </p>
                      )}
                      <p className="message-time mt-2">{formatMessageTime(message.timestamp)}</p>
                    </div>
                  </article>
                );
              })}

              {isThinking && (
                <article className="fade-slide-in flex justify-start">
                  <div className="message-bubble assistant inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-secondary)] [animation-delay:-180ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-secondary)] [animation-delay:-90ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-secondary)]" />
                  </div>
                </article>
              )}
            </div>
          )}
        </section>

        <section
          className={`pointer-events-none fixed bottom-0 right-0 z-20 bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)]/95 to-transparent pb-5 pt-10 transition-[left] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] left-0 ${
            isDesktopSidebarOpen ? "lg:left-[300px]" : "lg:left-[92px]"
          }`}
        >
          <div
            className={`pointer-events-auto mx-auto w-full px-4 sm:px-6 composer-rail ${
              isComposerFocused ? "composer-rail--focused" : "composer-rail--idle"
            }`}
          >
            {selectedFile && (
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--glass-raised)] px-4 py-2 text-xs">
                <span className="font-semibold">Attached:</span>
                <span>{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="ml-1 rounded-full px-1 text-[var(--text-secondary)] hover:bg-[var(--accent-soft)]"
                >
                  x
                </button>
              </div>
            )}

            <div
              className={`chat-shell composer-shell rounded-[1.75rem] border ${
                isComposerFocused ? "composer-shell--focused" : "composer-shell--idle"
              }`}
            >
              <div className="flex items-end gap-2">
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelection} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-[var(--border-soft)] bg-[var(--glass-raised)] p-2 text-[var(--text-secondary)] transition hover:border-[var(--accent)]"
                  aria-label="Attach file"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M11 5a1 1 0 0 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 0 1 0-2h5V5Z" />
                  </svg>
                </button>

                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={draft}
                  onChange={handleDraftInput}
                  onKeyDown={handleComposerKeyDown}
                  onFocus={() => setIsComposerFocused(true)}
                  onBlur={() => setIsComposerFocused(false)}
                  placeholder="Message AI Companion..."
                  className={`max-h-[190px] flex-1 resize-none border-none bg-transparent px-2 outline-none transition-[min-height,padding,font-size] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isComposerFocused ? "min-h-[60px] py-3 text-[0.96rem]" : "min-h-[46px] py-2 text-sm"
                  }`}
                />

                <button
                  type="button"
                  disabled={!canSend || isThinking}
                  onClick={() => submitMessage()}
                  className="primary-cta rounded-xl px-4 py-2 text-sm font-bold shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>

            <p className="mt-2 text-center text-[11px] text-[var(--text-secondary)]">
              AI Companion offers supportive guidance and planning, not clinical or emergency care.
            </p>
          </div>
        </section>
      </main>

      {isPremiumModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-8 shadow-2xl">
            {/* Close Button */}
            <button
              onClick={() => setIsPremiumModalOpen(false)}
              className="absolute right-6 top-6 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
              </svg>
            </button>

            {/* Header */}
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-[var(--text-primary)]">
                Upgrade to Premium
              </h2>
              <p className="mt-2 text-[var(--text-secondary)]">
                Unlock unlimited conversations and exclusive features
              </p>
            </div>

            {/* Features Grid */}
            <div className="mb-8 grid gap-3 sm:grid-cols-2">
              {["Unlimited conversations", "Advanced analytics", "Priority support", "Custom themes", "Export conversations", "API access"].map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[var(--accent)] to-[#0d6d9b]">
                    <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {feature}
                  </span>
                </div>
              ))}
            </div>

            {/* Pricing Plans */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              {[
                { name: "Monthly", price: "$9.99", period: "/month", desc: "Cancel anytime", highlighted: false },
                { name: "Yearly", price: "$79.99", period: "/year", desc: "Save 33%", highlighted: true },
              ].map((plan, index) => (
                <div
                  key={index}
                  className={`relative rounded-2xl border-2 p-6 transition ${
                    plan.highlighted
                      ? "border-[var(--accent)] bg-gradient-to-br from-[var(--accent)]/10 to-transparent"
                      : "border-[var(--border-soft)] bg-[var(--bg-base)]"
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 transform">
                      <span className="inline-block rounded-full bg-gradient-to-r from-[var(--accent)] to-[#0d6d9b] px-3 py-1 text-xs font-bold text-white">
                        BEST VALUE
                      </span>
                    </div>
                  )}

                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    {plan.name}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {plan.desc}
                  </p>

                  <div className="mt-4 mb-6">
                    <div className="flex items-baseline">
                      <span className="text-3xl font-bold text-[var(--text-primary)]">
                        {plan.price}
                      </span>
                      <span className="text-sm text-[var(--text-secondary)]">
                        {plan.period}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      alert(`Upgrading to ${plan.name} plan - ${plan.price}${plan.period}`);
                      setIsPremiumModalOpen(false);
                    }}
                    className={`w-full rounded-lg px-4 py-3 font-semibold transition ${
                      plan.highlighted
                        ? "bg-gradient-to-r from-[var(--accent)] to-[#0d6d9b] text-white hover:shadow-lg"
                        : "border border-[var(--border-soft)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    {plan.highlighted ? "Get Started" : "Choose Plan"}
                  </button>
                </div>
              ))}
            </div>

            {/* Money-back guarantee */}
            <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-base)] px-4 py-3 text-center text-sm text-[var(--text-secondary)]">
              <svg className="h-5 w-5 text-[#1f9a73]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1zm-2 15l-5-5 1.41-1.41L10 13.17l7.59-7.59L19 7l-9 9z" />
              </svg>
              <span>30-day money-back guarantee. No questions asked.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
