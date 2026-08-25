import { apiRequest, ensureSession, escapeHtml, showStatus } from "./common.js?v=20260822-community-feed-v1";

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
  loadMoreButton: document.getElementById("community-load-more"),
  filterButtons: [...document.querySelectorAll("[data-community-filter]")],
  promptButtons: [...document.querySelectorAll("[data-community-prompt]")],
  topicPromptButton: document.querySelector("[data-community-topic-prompt]"),
  emptyCopy: document.getElementById("community-filter-empty-copy"),
  pulseReflections: document.getElementById("community-pulse-reflections"),
  pulseSupport: document.getElementById("community-pulse-support"),
  reportDialog: document.getElementById("community-report-dialog"),
  reportForm: document.getElementById("community-report-form"),
  reportSubmit: document.getElementById("community-report-submit"),
  principleTabs: [...document.querySelectorAll("[data-community-principle]")],
  principlePanels: [...document.querySelectorAll("[data-community-principle-panel]")],
  panelComposeButtons: [...document.querySelectorAll("[data-community-panel-compose]")],
  guidelinesButton: document.querySelector("[data-community-show-guidelines]"),
  agreements: document.querySelector(".community-agreements"),
};

const state = {
  posts: [],
  page: 1,
  limit: 20,
  hasMore: false,
  total: 0,
  filter: "latest",
  isSubmitting: false,
  likeInFlight: new Set(),
  reportingPostId: "",
  reportInFlight: false,
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

function getFilteredPosts() {
  const posts = [...state.posts];
  if (state.filter === "related") {
    return posts.sort((left, right) => Number(right.likes || 0) - Number(left.likes || 0));
  }
  if (state.filter === "mine") {
    return posts.filter((post) => Boolean(post.owned_by_current_user || post.ownedByCurrentUser));
  }
  return posts;
}

function renderPulse() {
  if (elements.pulseReflections) {
    elements.pulseReflections.textContent = new Intl.NumberFormat().format(state.total || state.posts.length);
  }
  if (elements.pulseSupport) {
    const supportCount = state.posts.reduce((total, post) => total + Number(post.likes || 0), 0);
    elements.pulseSupport.textContent = new Intl.NumberFormat().format(supportCount);
  }
}

function renderFilterState() {
  elements.filterButtons.forEach((button) => {
    const isActive = button.dataset.communityFilter === state.filter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function activatePrinciple(name, { moveFocus = false } = {}) {
  const selectedTab = elements.principleTabs.find((tab) => tab.dataset.communityPrinciple === name);
  if (!selectedTab) {
    return;
  }

  elements.principleTabs.forEach((tab) => {
    const isSelected = tab === selectedTab;
    tab.classList.toggle("active", isSelected);
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  });
  elements.principlePanels.forEach((panel) => {
    panel.hidden = panel.dataset.communityPrinciplePanel !== name;
  });
  if (moveFocus) {
    selectedTab.focus();
  }
}

function movePrincipleTab(currentTab, direction) {
  const currentIndex = elements.principleTabs.indexOf(currentTab);
  if (currentIndex < 0 || elements.principleTabs.length === 0) {
    return;
  }
  const nextIndex = (currentIndex + direction + elements.principleTabs.length) % elements.principleTabs.length;
  activatePrinciple(elements.principleTabs[nextIndex].dataset.communityPrinciple || "commons", { moveFocus: true });
}

function renderPosts() {
  if (!elements.postList || !elements.emptyState) {
    return;
  }

  const visiblePosts = getFilteredPosts();
  elements.emptyState.hidden = visiblePosts.length > 0;
  if (elements.emptyCopy) {
    elements.emptyCopy.textContent = state.filter === "mine"
      ? "You have not shared a reflection in the loaded feed yet. When you do, it will remain anonymous to everyone else."
      : "Be the first to share something honest. Your post will never reveal your profile details.";
  }
  if (elements.emptyComposeButton) {
    elements.emptyComposeButton.textContent = state.filter === "mine" ? "Share a reflection" : "Write the first reflection";
  }
  elements.postList.innerHTML = visiblePosts
    .map((post, index) => {
      const postId = getPostId(post);
      const anonymousLabel = getAnonymousLabel();
      const avatarClass = getAvatarClass(postId);
      const avatarLabel = getAvatarLabel();
      const likeCount = Number(post.likes || 0);
      const isLikePending = state.likeInFlight.has(postId);
      const isRelated = Boolean(post.liked_by_current_user || post.likedByCurrentUser);
      const isOwner = Boolean(post.owned_by_current_user || post.ownedByCurrentUser);
      const moderationStatus = post.moderation_status || post.moderationStatus || "visible";

      return `
        <article class="post-card" data-post-id="${escapeHtml(postId)}">
          <span class="post-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          <div class="post-header">
            <div class="post-author-avatar ${avatarClass}">${escapeHtml(avatarLabel)}</div>
            <div class="post-author">
              <h4>${escapeHtml(anonymousLabel)}</h4>
              <span>${escapeHtml(formatRelativeTime(post.created_at))}${post.updated_at ? " · edited" : ""}</span>
            </div>
            <span class="post-privacy-mark">IDENTITY HIDDEN</span>
          </div>
          <blockquote class="post-body">${escapeHtml(post.content)}</blockquote>
          <div class="post-footer">
            <div class="post-actions">
              <button
                class="post-action post-action-button"
                type="button"
                data-like-post-id="${escapeHtml(postId)}"
                ${isLikePending || isRelated ? "disabled" : ""}
              >
                ${isRelated ? "Related" : "Relate"} ${likeCount}
              </button>
              ${isOwner ? `
                <button class="post-action post-action-button" type="button" data-edit-post-id="${escapeHtml(postId)}">Edit</button>
                <button class="post-action post-action-button" type="button" data-delete-post-id="${escapeHtml(postId)}">Delete</button>
              ` : `<button class="post-action post-action-button" type="button" data-report-post-id="${escapeHtml(postId)}">Report privately</button>`}
              ${isOwner && moderationStatus !== "visible" ? `<span class="post-action">In review</span>` : ""}
            </div>
            <span class="community-pill">No profile attached</span>
          </div>
        </article>
      `;
    })
    .join("");

  if (elements.loadMoreButton) {
    elements.loadMoreButton.hidden = !state.hasMore;
  }
  renderFilterState();
  renderPulse();
}

async function loadPosts({ append = false } = {}) {
  showStatus(elements.feedStatus, "Loading community reflections...", "info");

  try {
    const response = await apiRequest(`/posts?page=${state.page}&limit=${state.limit}`, {
      auth: true,
      cache: "no-store",
    });
    const posts = Array.isArray(response) ? response : response.posts || [];
    state.posts = append ? [...state.posts, ...posts] : posts;
    state.hasMore = Array.isArray(response) ? false : Boolean(response.has_more || response.hasMore);
    state.total = Array.isArray(response) ? state.posts.length : Number(response.total || state.posts.length);
    renderPosts();
    showStatus(elements.feedStatus, "");
  } catch (error) {
    if (!append) {
      state.posts = [];
    }
    renderPosts();
    showStatus(elements.feedStatus, error.message || "Could not load community posts.");
  }
}

function usePrompt(prompt) {
  if (!elements.textarea) {
    return;
  }
  elements.textarea.value = prompt;
  updateCharacterCount();
  updateSubmitButton();
  focusComposer();
}

function openReportDialog(postId) {
  if (!elements.reportDialog || !postId) {
    return;
  }
  state.reportingPostId = postId;
  elements.reportForm?.reset();
  elements.reportDialog.showModal();
}

async function submitReport(event) {
  event.preventDefault();
  const submitterValue = event.submitter?.value;
  if (submitterValue !== "submit") {
    elements.reportDialog?.close();
    state.reportingPostId = "";
    return;
  }

  const reason = new FormData(elements.reportForm).get("reason");
  if (!reason || !state.reportingPostId || state.reportInFlight) {
    return;
  }

  state.reportInFlight = true;
  if (elements.reportSubmit) elements.reportSubmit.disabled = true;
  try {
    const response = await apiRequest(`/posts/${state.reportingPostId}/report`, {
      method: "POST",
      auth: true,
      body: { reason },
    });
    elements.reportDialog?.close();
    showStatus(elements.feedStatus, response?.message || "Reflection sent privately for review.", "success");
    state.reportingPostId = "";
  } catch (error) {
    showStatus(elements.feedStatus, error.message || "Could not send that private report.");
    elements.reportDialog?.close();
  } finally {
    state.reportInFlight = false;
    if (elements.reportSubmit) elements.reportSubmit.disabled = false;
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
      state.total += 1;
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

async function handleEdit(postId) {
  const post = state.posts.find((item) => getPostId(item) === postId);
  if (!post) {
    return;
  }

  const nextContent = window.prompt("Edit your anonymous reflection", post.content);
  if (nextContent === null) {
    return;
  }

  const content = nextContent.trim();
  if (!content) {
    showStatus(elements.feedStatus, "Post content cannot be empty.");
    return;
  }

  try {
    const response = await apiRequest(`/posts/${postId}`, {
      method: "PATCH",
      auth: true,
      body: { content },
    });
    if (response?.post) {
      state.posts = state.posts.map((item) => (getPostId(item) === postId ? response.post : item));
      renderPosts();
    }
    showStatus(elements.feedStatus, response?.message || "Post updated.", "success");
  } catch (error) {
    showStatus(elements.feedStatus, error.message || "Could not update that post.");
  }
}

async function handleDelete(postId) {
  if (!window.confirm("Delete this anonymous reflection?")) {
    return;
  }

  try {
    const response = await apiRequest(`/posts/${postId}`, {
      method: "DELETE",
      auth: true,
    });
    state.posts = state.posts.filter((post) => getPostId(post) !== postId);
    state.total = Math.max(0, state.total - 1);
    renderPosts();
    showStatus(elements.feedStatus, response?.message || "Post deleted.", "success");
  } catch (error) {
    showStatus(elements.feedStatus, error.message || "Could not delete that post.");
  }
}

async function handleLike(postId) {
  const post = state.posts.find((item) => getPostId(item) === postId);
  if (!postId || state.likeInFlight.has(postId) || post?.liked_by_current_user || post?.likedByCurrentUser) {
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
  elements.promptButtons.forEach((button) => {
    button.addEventListener("click", () => usePrompt(button.dataset.communityPrompt || ""));
  });
  elements.topicPromptButton?.addEventListener("click", () => {
    usePrompt(elements.topicPromptButton.dataset.communityTopicPrompt || "");
  });
  elements.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.communityFilter || "latest";
      renderPosts();
    });
  });
  elements.reportForm?.addEventListener("submit", submitReport);
  elements.reportDialog?.addEventListener("close", () => {
    state.reportingPostId = "";
  });
  elements.principleTabs.forEach((tab) => {
    tab.addEventListener("click", () => activatePrinciple(tab.dataset.communityPrinciple || "commons"));
    tab.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        movePrincipleTab(tab, 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        movePrincipleTab(tab, -1);
      } else if (event.key === "Home") {
        event.preventDefault();
        activatePrinciple(elements.principleTabs[0]?.dataset.communityPrinciple || "commons", { moveFocus: true });
      } else if (event.key === "End") {
        event.preventDefault();
        activatePrinciple(elements.principleTabs.at(-1)?.dataset.communityPrinciple || "commons", { moveFocus: true });
      }
    });
  });
  elements.panelComposeButtons.forEach((button) => button.addEventListener("click", focusComposer));
  elements.guidelinesButton?.addEventListener("click", () => {
    elements.agreements?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  elements.loadMoreButton?.addEventListener("click", async () => {
    state.page += 1;
    await loadPosts({ append: true });
  });
  elements.postList?.addEventListener("click", (event) => {
    const likeButton = event.target.closest("[data-like-post-id]");
    if (likeButton) {
      handleLike(likeButton.dataset.likePostId || "");
      return;
    }

    const editButton = event.target.closest("[data-edit-post-id]");
    if (editButton) {
      handleEdit(editButton.dataset.editPostId || "");
      return;
    }

    const deleteButton = event.target.closest("[data-delete-post-id]");
    if (deleteButton) {
      handleDelete(deleteButton.dataset.deletePostId || "");
      return;
    }

    const reportButton = event.target.closest("[data-report-post-id]");
    if (reportButton) {
      openReportDialog(reportButton.dataset.reportPostId || "");
    }
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
  state.page = 1;
  await loadPosts();

  // Refresh when a user returns to the tab so posts shared by other accounts
  // appear without requiring a hard reload.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !state.isSubmitting) {
      state.page = 1;
      void loadPosts();
    }
  });
}

initCommunityPage();
