import { apiRequest, ensureSession, escapeHtml, showStatus } from "./common.js";

const MAX_POST_LENGTH = 2000;
const AVATAR_CLASSES = ["post-avatar-one", "post-avatar-two", "post-avatar-three"];

const elements = {
  feedStatus: document.getElementById("community-feed-status"),
  emptyState: document.getElementById("community-empty-state"),
  postList: document.getElementById("community-post-list"),
  form: document.getElementById("community-post-form"),
  textarea: document.getElementById("community-post-input"),
  composeStatus: document.getElementById("community-compose-status"),
  charCount: document.getElementById("community-char-count"),
  submitButton: document.getElementById("community-submit-button"),
  anonymousHint: document.getElementById("community-anonymous-hint"),
  focusComposeButton: document.getElementById("community-focus-compose"),
  topicComposeButton: document.getElementById("community-topic-compose"),
  emptyComposeButton: document.getElementById("community-empty-compose"),
  composeCard: document.getElementById("community-compose-card"),
};

const state = {
  posts: [],
  isSubmitting: false,
  likeInFlight: new Set(),
};

function isCommunityPage() {
  return Boolean(elements.postList && elements.form && elements.textarea);
}

function getPostId(post) {
  return post?._id || post?.id || "";
}

function getAnonymousLabel() {
  return "Anonymous";
}

function hashValue(value) {
  return Array.from(String(value || "")).reduce((total, char) => total + char.charCodeAt(0), 0);
}

function getAvatarClass(seed) {
  return AVATAR_CLASSES[hashValue(seed) % AVATAR_CLASSES.length];
}

function getAvatarLabel() {
  return "A";
}

function clearLegacyAnonymousIds() {
  const prefix = "ai-companion:community-anonymous-id:";
  const keysToDelete = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => window.localStorage.removeItem(key));
}

function formatRelativeTime(isoTime) {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 1) {
    return "Just now";
  }
  if (Math.abs(diffMinutes) < 60) {
    return relativeFormatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMs / 3600000);
  if (Math.abs(diffHours) < 24) {
    return relativeFormatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffMs / 86400000);
  if (Math.abs(diffDays) < 7) {
    return relativeFormatter.format(diffDays, "day");
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function focusComposer() {
  elements.composeCard?.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.textarea?.focus();
}

function updateCharacterCount() {
  const length = elements.textarea?.value.length || 0;
  if (elements.charCount) {
    elements.charCount.textContent = `${length} / ${MAX_POST_LENGTH}`;
  }
}

function updateSubmitButton() {
  if (!elements.submitButton || !elements.textarea) {
    return;
  }

  const hasContent = elements.textarea.value.trim().length > 0;
  elements.submitButton.disabled = state.isSubmitting || !hasContent;
}

function renderAnonymousHint() {
  if (!elements.anonymousHint) {
    return;
  }

  elements.anonymousHint.textContent = "Posting as Anonymous. Your private identifier is never shown to users.";
}

function renderPosts() {
  if (!elements.postList || !elements.emptyState) {
    return;
  }

  elements.emptyState.hidden = state.posts.length > 0;
  elements.postList.innerHTML = state.posts
    .map((post) => {
      const postId = getPostId(post);
      const anonymousLabel = getAnonymousLabel();
      const avatarClass = getAvatarClass(postId);
      const avatarLabel = getAvatarLabel();
      const likeCount = Number(post.likes || 0);
      const isLikePending = state.likeInFlight.has(postId);

      return `
        <article class="post-card" data-post-id="${escapeHtml(postId)}">
          <div class="post-header">
            <div class="post-author-avatar ${avatarClass}">${escapeHtml(avatarLabel)}</div>
            <div class="post-author">
              <h4>${escapeHtml(anonymousLabel)}</h4>
              <span>${escapeHtml(formatRelativeTime(post.created_at))}</span>
            </div>
          </div>
          <p class="post-body">${escapeHtml(post.content)}</p>
          <div class="post-footer">
            <div class="post-actions">
              <button
                class="post-action post-action-button"
                type="button"
                data-like-post-id="${escapeHtml(postId)}"
                ${isLikePending ? "disabled" : ""}
              >
                Relate ${likeCount}
              </button>
              <span class="post-action">Anonymous only</span>
            </div>
            <span class="community-pill">${escapeHtml(anonymousLabel)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadPosts() {
  showStatus(elements.feedStatus, "Loading community reflections...", "info");

  try {
    const posts = await apiRequest("/posts", { auth: true });
    state.posts = Array.isArray(posts) ? posts : [];
    renderPosts();
    showStatus(elements.feedStatus, "");
  } catch (error) {
    state.posts = [];
    renderPosts();
    showStatus(elements.feedStatus, error.message || "Could not load community posts.");
  }
}

async function submitPost(event) {
  event.preventDefault();

  const content = elements.textarea?.value.trim() || "";
  if (!content) {
    showStatus(elements.composeStatus, "Write something before posting.");
    updateSubmitButton();
    return;
  }

  state.isSubmitting = true;
  updateSubmitButton();
  showStatus(elements.composeStatus, "Posting anonymously...", "info");

  try {
    const response = await apiRequest("/posts", {
      method: "POST",
      auth: true,
      body: { content },
    });

    if (response?.post) {
      state.posts = [response.post, ...state.posts];
      renderPosts();
    }

    if (elements.textarea) {
      elements.textarea.value = "";
    }
    updateCharacterCount();
    showStatus(elements.composeStatus, response?.message || "Post created successfully.", "success");
    showStatus(elements.feedStatus, "");
    updateSubmitButton();
  } catch (error) {
    showStatus(elements.composeStatus, error.message || "Could not create your post.");
  } finally {
    state.isSubmitting = false;
    updateSubmitButton();
  }
}

async function handleLike(postId) {
  if (!postId || state.likeInFlight.has(postId)) {
    return;
  }

  state.likeInFlight.add(postId);
  renderPosts();

  try {
    const response = await apiRequest(`/posts/${postId}/like`, {
      method: "POST",
      auth: true,
    });

    if (response?.post) {
      state.posts = state.posts.map((post) => (getPostId(post) === postId ? response.post : post));
      renderPosts();
    }
    showStatus(elements.feedStatus, "");
  } catch (error) {
    showStatus(elements.feedStatus, error.message || "Could not like that post.");
  } finally {
    state.likeInFlight.delete(postId);
    renderPosts();
  }
}

function bindEvents() {
  elements.form?.addEventListener("submit", submitPost);
  elements.textarea?.addEventListener("input", () => {
    showStatus(elements.composeStatus, "");
    updateCharacterCount();
    updateSubmitButton();
  });

  [elements.focusComposeButton, elements.topicComposeButton, elements.emptyComposeButton].forEach((button) => {
    button?.addEventListener("click", focusComposer);
  });

  elements.postList?.addEventListener("click", (event) => {
    const likeButton = event.target.closest("[data-like-post-id]");
    if (!likeButton) {
      return;
    }

    handleLike(likeButton.dataset.likePostId || "");
  });
}

async function initCommunityPage() {
  if (!isCommunityPage()) {
    return;
  }

  const session = await ensureSession({ redirectTo: "/login" });
  if (!session?.verified) {
    return;
  }

  clearLegacyAnonymousIds();
  renderAnonymousHint();
  updateCharacterCount();
  updateSubmitButton();
  bindEvents();
  await loadPosts();
}

initCommunityPage();
