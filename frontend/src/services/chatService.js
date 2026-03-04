import api from "./api";

export const fetchChats = async () => {
  const res = await api.get("/chat");
  return res.data;
};

export const sendChatMessage = async (message, options = {}) => {
  const { apiKey, history = [], model = "gemini-2.0-flash" } = options;

  const res = await api.post("/chat", {
    message,
    apiKey,
    history,
    model,
  });
  return res.data;
};
