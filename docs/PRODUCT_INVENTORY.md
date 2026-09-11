# Product inventory — 8 September 2026

Source inventory before this pass. Existing uncommitted work is the baseline.

## Pages, sections, dialogs and loaded modules

### app/templates/profile.html

- Profile & Settings
- Mahesh Reddy
- Choose one of Emora's cute built-in avatars or upload your own photo.
- Built-in avatar presets
- Companion preferences
- In-app reflections
- Accessibility & comfort
- Gentle check-in schedule
- Sessions & security activity
- Privacy & data
- Danger zone

Dialogs: 

Modules: /static/js/workspace-shell.js, /static/js/profile.js

### app/templates/_workspace_rail.html

- PINNED
- RECENT

Dialogs: 

Modules: 

### app/templates/forgot_password.html

- Come back when you’re ready.

Dialogs: 

Modules: /static/js/atmosphere.js?v=20260822-auth-doorway-v1, /static/js/forgot-password.js

### app/templates/play.html

- Make your innerworldfeel alive.
- See the rhythmyou are building.
- Small wins,real momentum.
- Nothing to maintain.Something to return to.
- One thing lighter.
- Leave somethingworth returning to.
- Keep the good details close.
- Design the room you return to.
- Turn a thought intoits next shape.
- Keep one replyin Emora’s voice.

Dialogs: <section class="play-completion-layer" id="play-completion-layer" role="dialog" aria-modal="true" aria-labelledby="play-completion-title" hidden

Modules: /static/js/play.js?v=20260822-premium-depth-v2

### app/templates/offline.html

- Your private actions are paused.

Dialogs: 

Modules: 

### app/templates/ui_lab.html

- Emora state laboratory
- Presence language
- Dynamic surface scenes
- Keeping the final shape steady
- No saved reflections yet
- Verified content is available
- Your draft stays here
- This action needs a fresh sign-in
- That action needs a short pause
- A newer version exists
- Conversation loaded; sources did not
- The save did not finish
- Advanced insight, not fabricated
- Hierarchy and materials

Dialogs: 

Modules: 

### app/templates/status.html

- Live, public-safe availability.

Dialogs: 

Modules: /static/js/public-status.js?v=20260830

### app/templates/community.html

- Community
- You do not have tocarry it alone.
- Your reflection travels.Your identity does not.
- Recognition can help.Advice can harm.
- What people are carrying
- No reflections yet
- Share anonymously
- How we hold this space
- What became lighter?
- What should we review?

Dialogs: <dialog class="community-report-dialog" id="community-report-dialog" aria-labelledby="community-report-title"

Modules: /static/js/workspace-shell.js, /static/js/community.js?v=20260824-community-premium-v2

### app/templates/help.html

- A little clarity,right when you need it.
- Begin a conversation
- Explore Emora Play
- Manage your data
- When you need more support
- Nothing matched that phrase.

Dialogs: 

Modules: /static/js/library.js

### app/templates/home.html

- An AI companionthat grows withyour permission.
- A quieter way tokeep moving.
- Arrive as you are.
- Stay in control of memory.
- Watch your world respond.
- Choose a way Emora can meet the moment.
- Step out of the noise.Come back to your pace.

Dialogs: 

Modules: /static/js/home.js?v=20260822-cinematic-room

### app/templates/changelog.html

- What changed, without the fog.
- Trust and product operations
- Premium experience completion

Dialogs: 

Modules: 

### app/templates/base.html

- Make Emora more personal
- Search your Emora space
- Draft recovery
- Help without losing your place

Dialogs: <dialog class="upgrade-dialog" id="upgrade-dialog" aria-labelledby="upgrade-dialog-title", <dialog class="workspace-command-dialog" id="workspace-command-dialog" aria-labelledby="workspace-command-title", <aside class="emora-contextual-concierge" id="emora-contextual-concierge" role="dialog" aria-modal="false" aria-labelledby="emora-contextual-concierge-title" hidden

Modules: /static/js/motion.js?v=20260710-flagship, /static/js/pwa-register.js?v=20260830, /static/js/emora-system.js?v=20260830-foundation-v2, /static/js/workspace-tools.js?v=20260828-sessions-v1

### app/templates/payment.html

- More ways to growwith you and Emora.
- Longer, richer conversations
- Deeper companion memory
- Personal rituals and insights
- Choose your Emora plan
- One account. Four levels of support.
- Manage subscriptions
- Simple, clear, and always in your control.

Dialogs: 

Modules: /static/js/payment.js?v=20260822-emora-plus

### app/templates/research.html

- Built for reflection,bounded by care.
- Ask for evidence,not just an answer.
- Reflect, don’t diagnose
- Support has boundaries
- Insights stay approximate
- You own the controls
- Research shelf
- Claims stay beside their evidence.

Dialogs: 

Modules: /static/js/workspace-shell.js, /static/js/library.js?v=20260828-research-studio-v1

### app/templates/notifications.html

- Small things worthnoticing.
- Gathering what matters…

Dialogs: 

Modules: /static/js/notifications.js?v=20260828-live-notes-v3

### app/templates/reset_password.html

- Choose a new key.

Dialogs: 

Modules: /static/js/atmosphere.js?v=20260822-auth-doorway-v1, /static/js/reset-password.js

### app/templates/verify_otp.html

- Check your inbox.

Dialogs: 

Modules: /static/js/atmosphere.js?v=20260822-auth-doorway-v1, /static/js/verify-otp.js

### app/templates/register.html

- A place for yourself.

Dialogs: 

Modules: /static/js/atmosphere.js?v=20260905-auth-v2, /static/js/register.js

### app/templates/login.html

- Good to see you.

Dialogs: 

Modules: /static/js/atmosphere.js?v=20260905-auth-v2, /static/js/login.js

### app/templates/journal.html

- A quieter placeto arrive.
- Past reflections

Dialogs: 

Modules: /static/js/personal.js

### app/templates/dashboard.html

- Welcome back,Friend.
- There is nothing you need to prove here.
- A story made only from what happened.
- The things you choose begin to connect.
- How are you meeting today?
- Recent conversations
- Things you want Emora to know
- A few things worth remembering
- What would feel useful today?

Dialogs: <dialog class="goal-onboarding" id="goal-onboarding" aria-labelledby="goal-onboarding-title"

Modules: /static/js/workspace-shell.js?v=20260824-dashboard-atmosphere-v1

### app/templates/_sidebar_plan.html



Dialogs: 

Modules: 

### app/templates/your_emora.html

- Yuna

Dialogs: 

Modules: /static/js/atmosphere.js?v=20260713, /static/js/your-emora.js?v=20260908-motion-chat

### app/templates/_auth_story.html

- {{ auth_story_heading | safe }}

Dialogs: 

Modules: 

### app/templates/together.html

- Your people,one shared orbit.
- Invite someone you know.
- Waiting at the door.
- Friends, without a public count.
- Your friend space is quiet.
- A room that belongs to all of you.
- Choose or create a circle.
- Together
- You stay in control.
- Who is this space for?
- Choose an accepted friend.

Dialogs: <dialog class="together-dialog" id="together-circle-dialog" aria-labelledby="together-circle-dialog-title", <dialog class="together-dialog together-small-dialog" id="together-member-dialog" aria-labelledby="together-member-dialog-title"

Modules: /static/js/together.js?v=20260901-together-v1

### app/templates/goals.html

- One clear direction.No pressure.
- Goals in view

Dialogs: 

Modules: /static/js/personal.js

### app/templates/focus_together.html

- Quiet company,shared intention.
- Choose how youwant to arrive.
- Set the intention.
- Step in quietly.
- No active room yet
- A conversation for this room.
- Present, not exposed.
- Bounded by design.
- Invitation only.
- End this session?

Dialogs: <dialog class="focus-end-dialog" id="focus-end-dialog" aria-labelledby="focus-end-title"

Modules: /static/js/focus-together.js?v=20260823-focus-realtime-v2

### app/templates/sessions.html

- Begin with an intention.Leave with what matters.
- How would you like to begin?
- Your week, confirmed by you.
- Why Emora remembers.
- Recent sessions
- What should leave with you?

Dialogs: <dialog class="session-complete-dialog" id="session-complete-dialog" aria-labelledby="session-complete-title"

Modules: /static/js/emora-sessions.js?v=20260828-v1

### app/templates/insights.html

- Emotional Insights
- What is beginning to connect
- A factual look back
- The words you chose to keep
- The shape of this chapter
- Your chapter with Emora
- The moments that shaped this period
- Emotional tone over time
- Mood distribution
- Session activity - past 84 days
- How you have been arriving
- What may be changing
- Optional camera check-ins
- Average emotional state by day of week

Dialogs: 

Modules: /static/js/workspace-shell.js?v=20260822-premium-depth-v2

### app/templates/trust.html

- Clear answers about your space.
- What stays and what leaves
- Your controls
- Important limits
- Retention and help

Dialogs: 

Modules: 

### app/templates/chat.html

- Meet the moment gently.
- How are you arriving?
- Choose how Emora responds
- Conversation atmosphere
- Ambient sound
- What Emora remembers
- Conversation collections
- What’s on your mind?
- Workspace preferences
- Theme
- Local drafts
- Session
- Privacy and terms
- Privacy
- Terms
- Choose your access
- Free
- Voice + continuity
- Reflect + create
- Every capability

Dialogs: <div class="dashboard-modal-card card" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title", <div class="dashboard-modal-card card" role="dialog" aria-modal="true" aria-labelledby="policy-modal-title", <div class="dashboard-modal-card card" role="dialog" aria-modal="true" aria-labelledby="premium-modal-title"

Modules: /static/js/dashboard.js?v=20260908-motion-chat

## Router declarations

### app/routers/companion.py

```python
router = APIRouter(prefix="/api/companion", tags=["companion"])
@router.get("/memories")
@router.post("/memories", status_code=201)
@router.patch("/memories/{memory_id}")
@router.delete("/memories/{memory_id}")
@router.get("/dashboard")
@router.post("/reflections")
```

### app/routers/billing.py

```python
router = APIRouter(prefix="/api/billing", tags=["billing"])
@router.get("/plans")
@router.get("/access")
@router.post("/checkout", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(rate_limit(8, 300, "billing-checkout"))])
@router.get("/admin/users")
@router.patch("/admin/users/{user_id}/subscription")
```

### app/routers/api_chat.py

```python
router = APIRouter(prefix="/api/chat", tags=["chat"])
@router.post("/search-decision")
@router.post("/turns/{client_turn_id}/cancel")
@router.get("")
@router.post("/conversations")
@router.patch("/conversations/{conversation_id}")
@router.delete("/conversations/{conversation_id}")
@router.get("/conversations/{conversation_id}/export")
@router.post("/attachments", status_code=201, dependencies=[Depends(rate_limit(12, 300, "chat-attachment"))])
@router.get("/attachments/{attachment_id}")
@router.post("/stream", dependencies=[Depends(rate_limit(30, 300, "chat-send"))])
@router.post("", dependencies=[Depends(rate_limit(30, 300, "chat-send"))])
```

### app/routers/product_operations.py

```python
router = APIRouter(prefix="/api/product", tags=["product"])
@router.get("/bootstrap")
@router.patch("/onboarding")
@router.post("/events", status_code=202)
```

### app/routers/posts.py

```python
router = APIRouter(prefix="/posts", tags=["posts"])
@router.post(
@router.get("", response_model=PostListResponse)
@router.post("/{post_id}/like", response_model=PostLikeResponse, dependencies=[Depends(rate_limit(60, 300, "posts-like"))])
@router.post("/{post_id}/report", dependencies=[Depends(rate_limit(12, 300, "posts-report"))])
@router.post("/{post_id}/mute")
@router.post("/{post_id}/block-author")
@router.post("/{post_id}/appeal")
@router.patch("/{post_id}", response_model=PostUpdateResponse, dependencies=[Depends(rate_limit(20, 300, "posts-update"))])
@router.delete("/{post_id}")
```

### app/routers/workspace_features.py

```python
router = APIRouter(prefix="/api/workspace", tags=["workspace"])
@router.get("/search")
@router.post("/sessions/register")
@router.get("/sessions")
@router.delete("/sessions/{session_id}")
@router.delete("/sessions")
@router.get("/collections")
@router.post("/collections", status_code=201)
@router.patch("/collections/{collection_id}")
@router.put("/collections/{collection_id}/conversation")
@router.delete("/collections/{collection_id}")
@router.put("/feedback")
@router.get("/research-shelf")
@router.post("/research-shelf", status_code=201)
@router.patch("/research-shelf/{item_id}")
@router.delete("/research-shelf/{item_id}")
@router.get("/research-shelf/export")
@router.get("/schedule")
@router.put("/schedule")
@router.get("/schedule/due")
@router.get("/notifications", dependencies=[Depends(rate_limit(120, 300, "notifications-read"))])
@router.put("/notifications/categories/{category}/mute")
@router.patch("/notifications/{notification_id}/read")
@router.patch("/notifications/{notification_id}/respond")
@router.post("/notifications/read-all")
@router.delete("/notifications/{notification_id}")
@router.post("/schedule/ack")
@router.get("/schedule/unsubscribe", response_class=Response)
@router.get("/privacy-summary")
@router.post("/restore/preview", dependencies=[Depends(rate_limit(10, 3600, "account-restore-preview"))])
@router.post("/restore/commit", dependencies=[Depends(rate_limit(3, 3600, "account-restore-commit"))])
```

### app/routers/__init__.py

```python

```

### app/routers/premium_experiences.py

```python
router = APIRouter(prefix="/api/premium", tags=["premium-experiences"])
@router.get("/sessions")
@router.get("/sessions/current")
@router.post("/sessions", status_code=201)
@router.patch("/sessions/{session_id}")
@router.post("/sessions/{session_id}/complete")
@router.get("/weekly-review")
@router.put("/weekly-review")
@router.get("/memory-center")
@router.patch("/memory-center/{memory_id}")
@router.delete("/memory-center/{memory_id}")
```

### app/routers/play.py

```python
router = APIRouter(prefix="/api/play", tags=["play"])
@router.get("/quests")
@router.post("/quests/{quest_id}/start")
@router.post("/quests/{quest_id}/complete")
@router.get("/garden")
@router.get("/progress")
@router.get("/ritual-history")
@router.get("/memories")
@router.post("/memories", status_code=201)
@router.delete("/memories/{memory_id}")
@router.post("/focus-rooms", status_code=201, dependencies=[Depends(rate_limit(10, 3600, "focus-room-create"))])
@router.post("/focus-rooms/join")
@router.get("/focus-rooms/current")
@router.get("/focus-rooms/{code}")
@router.get("/focus-rooms/{code}/events")
@router.post("/focus-rooms/{code}/leave", status_code=204)
@router.post("/focus-rooms/{code}/end")
@router.post("/focus-rooms/{code}/messages", dependencies=[Depends(rate_limit(30, 300, "focus-room-chat"))])
@router.post("/focus-rooms/{code}/reflection", dependencies=[Depends(rate_limit(5, 300, "focus-room-reflection"))])
@router.get("/space")
@router.put("/space")
@router.post("/remix")
@router.get("/postcard/{conversation_id}", dependencies=[Depends(rate_limit(8, 300, "voice-postcard"))])
```

### app/routers/experiences.py

```python
router = APIRouter(prefix="/api/experiences", tags=["experiences"])
@router.get("/moments")
@router.post("/moments", status_code=201)
@router.patch("/moments/{moment_id}")
@router.delete("/moments/{moment_id}")
@router.get("/taught-memories")
@router.post("/taught-memories", status_code=201)
@router.patch("/taught-memories/{memory_id}")
@router.delete("/taught-memories/{memory_id}")
@router.get("/daily-drop")
@router.get("/weekly-story")
@router.get("/constellation")
@router.delete("/constellation/{node_id:path}")
@router.get("/space")
@router.put("/space")
```

### app/routers/voices.py

```python
@router.get("/list")
@router.get("/status")
@router.post("/speak", dependencies=[Depends(rate_limit(20, 300, "voice-speak"))])
```

### app/routers/pages.py

```python
@router.get("/", response_class=HTMLResponse)
@router.get("/login", response_class=HTMLResponse)
@router.get("/register", response_class=HTMLResponse)
@router.get("/forgot-password", response_class=HTMLResponse)
@router.get("/verify-otp", response_class=HTMLResponse)
@router.get("/reset-password", response_class=HTMLResponse)
@router.get("/dashboard", response_class=HTMLResponse)
@router.get("/chat", response_class=HTMLResponse)
@router.get("/your-emora", response_class=HTMLResponse)
@router.get("/insights", response_class=HTMLResponse)
@router.get("/community", response_class=HTMLResponse)
@router.get("/together", response_class=HTMLResponse)
@router.get("/profile", response_class=HTMLResponse)
@router.get("/payment", response_class=HTMLResponse)
@router.get("/play", response_class=HTMLResponse)
@router.get("/focus-together", response_class=HTMLResponse)
@router.get("/journal", response_class=HTMLResponse)
@router.get("/goals", response_class=HTMLResponse)
@router.get("/help", response_class=HTMLResponse)
@router.get("/research", response_class=HTMLResponse)
@router.get("/notifications", response_class=HTMLResponse)
@router.get("/sessions", response_class=HTMLResponse)
@router.get("/trust", response_class=HTMLResponse)
@router.get("/status", response_class=HTMLResponse)
@router.get("/changelog", response_class=HTMLResponse)
@router.get("/offline", response_class=HTMLResponse, include_in_schema=False)
@router.get("/ui-lab", response_class=HTMLResponse, include_in_schema=False)
@router.get("/robots.txt", response_class=PlainTextResponse, include_in_schema=False)
@router.get("/sitemap.xml", include_in_schema=False)
@router.get("/service-worker.js", include_in_schema=False)
```

### app/routers/admin.py

```python
router = APIRouter(prefix="/api/admin", tags=["admin"])
@router.get("/diagnostics")
@router.get("/feature-flags")
@router.put("/feature-flags/{name}")
```

### app/routers/api_auth.py

```python
@router.post(
@router.post("/login", dependencies=[Depends(rate_limit(12, 300, "auth-login"))])
@router.post("/google", dependencies=[Depends(rate_limit(20, 300, "auth-google"))])
@router.get("/google/start", response_model=None)
@router.get("/verify")
@router.post("/logout")
@router.get("/avatar-presets")
@router.put("/profile/avatar/preset")
@router.put("/profile/avatar/upload")
@router.post("/send-otp", dependencies=[Depends(rate_limit(5, 600, "auth-send-otp"))])
@router.post("/verify-otp", dependencies=[Depends(rate_limit(10, 600, "auth-verify-otp"))])
@router.post("/reset-password", dependencies=[Depends(rate_limit(5, 600, "auth-reset-password"))])
@router.get("/google/callback", response_model=None)
```

### app/routers/together.py

```python
router = APIRouter(prefix="/api/together", tags=["together"])
@router.get("")
@router.post("/presence", dependencies=[Depends(rate_limit(30, 300, "together-presence"))])
@router.post("/friends/requests", status_code=201, dependencies=[Depends(rate_limit(12, 3600, "friend-request"))])
@router.post("/friends/requests/{request_id}/respond")
@router.delete("/friends/{friend_id}")
@router.post("/friends/{friend_id}/block")
@router.post("/circles", status_code=201, dependencies=[Depends(rate_limit(12, 3600, "circle-create"))])
@router.get("/circles/{circle_id}")
@router.post("/circles/{circle_id}/members")
@router.post("/circles/{circle_id}/messages", dependencies=[Depends(rate_limit(60, 300, "circle-message"))])
@router.post("/circles/{circle_id}/activities")
@router.post("/circles/{circle_id}/activities/{activity_id}/responses")
@router.delete("/circles/{circle_id}")
```

### app/routers/insights.py

```python
router = APIRouter(prefix="/api/insights", tags=["insights"])
@router.get("", dependencies=[Depends(rate_limit(60, 300, "insights-read"))])
```

### app/routers/personal.py

```python
router = APIRouter(prefix="/api/personal", tags=["personal"])
@router.get("/preferences")
@router.patch("/preferences")
@router.get("/check-ins")
@router.post("/check-ins")
@router.get("/journal")
@router.post("/journal", status_code=201)
@router.patch("/journal/{entry_id}")
@router.delete("/journal/{entry_id}")
@router.get("/goals")
@router.post("/goals", status_code=201)
@router.patch("/goals/{goal_id}")
@router.patch("/goals/{goal_id}/pause")
@router.patch("/goals/{goal_id}/archive")
@router.patch("/goals/{goal_id}/complete")
@router.patch("/goals/{goal_id}/reopen")
@router.patch("/goals/{goal_id}/tiny-thing")
@router.delete("/goals/{goal_id}")
```

### app/routers/account.py

```python
router = APIRouter(prefix="/api/account", tags=["account"])
@router.get("/export", dependencies=[Depends(rate_limit(3, 3600, "account-export"))])
@router.delete("/history", dependencies=[Depends(rate_limit(3, 3600, "account-history-delete"))])
@router.delete("", dependencies=[Depends(rate_limit(2, 3600, "account-delete"))])
```

## Network call sites (same-origin APIs included)

### app/static/js/profile.js

```
229: const response = await apiRequest("/api/auth/profile/avatar/preset", {
270: const response = await apiRequest("/api/auth/profile/avatar/upload", {
306: const response = await apiRequest("/api/personal/preferences", { method: "PATCH", auth: true, body: { [key]: nextValue, expectedVersion: state.preferenceVersion } });
332: const response = await apiRequest("/api/personal/preferences", { method: "PATCH", auth: true, body: { [key]: select.value, expectedVersion: state.preferenceVersion } });
354: const response = await apiRequest("/api/experiences/space", { method: "PUT", auth: true, body: { environment: elements.environmentSelect.value } });
364: const response = await apiRequest("/api/personal/preferences", { method: "PATCH", auth: true, body: { textSize: "system", motion: "system", contrast: "system", calmEffects: false, expectedVersion: state.preferenceVersion } });
381: await apiRequest("/api/workspace/schedule", { method: "PUT", auth: true, body: { enabled: false, channel: elements.scheduleChannel.value, time: elements.scheduleTime.value, timezone: elements.scheduleTimezone.value, days: [...elements.scheduleDays.selectedOptions].map((option) => Number(option.value)), quietStart: elements.scheduleQuietStart.value, quietEnd: elements.scheduleQuietEnd.value } });
390: await apiRequest("/api/workspace/schedule", { method: "PUT", auth: true, body: { enabled: elements.scheduleEnabled.getAttribute("aria-checked") === "true", channel: elements.scheduleChannel.value, time: elements.scheduleTime.value, timezone: elements.scheduleTimezone.value, days, quietStart: elements.scheduleQuietStart.value, quietEnd: elements.scheduleQuietEnd.value } });
399: const response = await apiRequest(`/api/workspace/sessions/${button.dataset.revokeSession}`, { method: "DELETE", auth: true });
406: try { await apiRequest("/api/workspace/sessions", { method: "DELETE", auth: true }); await loadSessions(); }
416: const response = await apiRequest("/api/workspace/restore/preview", { method: "POST", auth: true, body: { export: state.restorePayload, mode: elements.restoreMode.value } });
427: const response = await apiRequest("/api/workspace/restore/commit", { method: "POST", auth: true, body: { export: state.restorePayload, mode, confirmation } });
469: const response = await fetch("/api/account/export", { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
486: const response = await apiRequest("/api/account/history", { method: "DELETE", auth: true });
496: await apiRequest("/api/account", { method: "DELETE", auth: true });
507: const response = await apiRequest("/api/auth/avatar-presets", { auth: true });
512: const [response, space] = await Promise.all([apiRequest("/api/personal/preferences", { auth: true }), apiRequest("/api/experiences/space", { auth: true })]);
536: const { schedule } = await apiRequest("/api/workspace/schedule", { auth: true });
545: const response = await apiRequest("/api/workspace/sessions", { auth: true });
552: const response = await apiRequest("/api/workspace/privacy-summary", { auth: true });
559: const response = await apiRequest("/api/companion/dashboard", { auth: true });
```

### app/static/js/verify-otp.js

```
66: await apiRequest("/api/auth/verify-otp", {
93: await apiRequest("/api/auth/send-otp", {
```

### app/static/js/play.js

```
64: const [quests, garden] = await Promise.all([apiRequest("/api/play/quests", { auth: true }), apiRequest("/api/play/garden", { auth: true })]);
74: const [memories, space] = await Promise.all([apiRequest("/api/play/memories", { auth: true }), apiRequest("/api/play/space", { auth: true })]);
111: const archive = await apiRequest("/api/play/ritual-history", { auth: true });
122: const conversations = await apiRequest("/api/chat?limit=30", { auth: true });
160: await apiRequest(`/api/play/quests/${button.dataset.quest}/start`, { method: "POST", auth: true });
166: const result = await apiRequest(`/api/play/quests/${button.dataset.quest}/complete`, { method: "POST", auth: true });
185: byId("memory-form").addEventListener("submit", async (event) => { event.preventDefault(); const text = byId("memory-input").value.trim(); if (!text) return; await apiRequest("/api/play/memories", { method: "POST", auth: true, body: { text } }); byId("memory-input").value = ""; await load(); });
186: byId("memory-list").addEventListener("click", async (event) => { const button = event.target.closest("[data-memory]"); if (!button) return; await apiRequest(`/api/play/memories/${button.dataset.memory}`, { method: "DELETE", auth: true }); await load(); });
188: byId("space-form").addEventListener("submit", async (event) => { event.preventDefault(); if (!guardEntitlement("ambient_rooms")) return; await apiRequest("/api/play/space", { method: "PUT", auth: true, body: { background: byId("space-background").value, ambience: byId("space-ambience").value, accessory: byId("space-accessory").value } }); byId("space-status").textContent = "Your atmosphere is ready."; });
189: byId("remix-form").addEventListener("submit", async (event) => { event.preventDefault(); if (!guardEntitlement("conversation_remix")) return; const result = await apiRequest("/api/play/remix", { method: "POST", auth: true, body: { text: byId("remix-input").value, format: byId("remix-format").value } }); byId("remix-output").textContent = result.content + (result.createdGoal ? `\n\nSaved to Gentle Goals: ${result.createdGoal.title}` : ""); });
198: const response = await fetch(`/api/play/postcard/${encodeURIComponent(conversationId)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
```

### app/static/js/forgot-password.js

```
26: await apiRequest("/api/auth/send-otp", {
```

### app/static/js/workspace-tools.js

```
32: apiRequest("/api/workspace/sessions/register", { method: "POST", auth: true }),
33: apiRequest("/api/personal/preferences", { auth: true }).then((data) => applyAccessibility(data.preferences || {})),
34: apiRequest("/api/workspace/schedule/due", { auth: true }),
42: nudge.querySelector("button").addEventListener("click", async () => { await apiRequest("/api/workspace/schedule/ack", { method: "POST", auth: true }).catch(() => null); nudge.remove(); });
126: const data = await apiRequest(`/api/workspace/search?q=${encodeURIComponent(query)}`, { auth: true, cache: "no-store", signal: searchController.signal });
```

### app/static/js/workspace-shell.js

```
23: try { payload = await apiRequest("/api/product/bootstrap", { auth: true, cache: "no-store" }); }
43: await apiRequest("/api/product/onboarding", { method: "PATCH", auth: true, body: { status: "completed", goal, step: 1 } });
47: await apiRequest("/api/product/onboarding", { method: "PATCH", auth: true, body: { status: "skipped", step: 0 } });
87: const payload = await apiRequest("/api/experiences/taught-memories", { auth: true });
106: await apiRequest("/api/experiences/taught-memories", { method: "POST", auth: true, body: { value: input.value.trim(), label: "About me" } });
114: await apiRequest(`/api/experiences/taught-memories/${row.dataset.memoryId}`, { method: "DELETE", auth: true });
121: await apiRequest(`/api/experiences/taught-memories/${row.dataset.memoryId}`, { method: "PATCH", auth: true, body: { value: value.trim(), label: "About me" } });
148: const response = await apiRequest("/api/chat", { method: "POST", auth: true, body: { message, companionMode: "listen", characterName: "Emora" } });
512: fetch("/api/companion/dashboard", { headers }),
513: fetch("/api/chat?limit=100", { headers }),
514: apiRequest("/api/personal/check-ins?limit=3", { auth: true }),
515: apiRequest("/api/personal/journal", { auth: true }),
516: apiRequest("/api/personal/goals", { auth: true }),
517: apiRequest("/api/personal/preferences", { auth: true }),
518: apiRequest("/api/insights?days=30", { auth: true }).catch(() => null),
519: apiRequest("/api/experiences/daily-drop", { auth: true }),
520: apiRequest("/api/experiences/weekly-story", { auth: true }),
521: apiRequest("/api/experiences/constellation", { auth: true }),
522: apiRequest("/api/experiences/space", { auth: true }),
557: const result = await apiRequest("/api/personal/check-ins", { method: "POST", auth: true, body: { mood, tinyThing: document.getElementById("arrival-tiny-thing")?.value || "" } });
571: fetch(`/api/insights?days=${days}`, { headers: { Authorization: `Bearer ${localStorage.getItem(STORAGE_KEYS.token) || ""}` } }),
572: apiRequest("/api/experiences/moments", { auth: true }),
573: apiRequest("/api/experiences/weekly-story", { auth: true }),
574: apiRequest("/api/experiences/constellation", { auth: true }),
596: await apiRequest(`/api/experiences/moments/${item.dataset.savedMoment}`, { method: "DELETE", auth: true });
603: await apiRequest(`/api/experiences/constellation/${encodeURIComponent(node.dataset.constellationNode)}`, { method: "DELETE", auth: true });
```

### app/static/js/reset-password.js

```
53: await apiRequest("/api/auth/reset-password", {
```

### app/static/js/register.js

```
63: const payload = await apiRequest("/api/auth/google", {
102: await apiRequest("/api/auth/register", {
```

### app/static/js/library.js

```
38: const response = await apiRequest("/api/workspace/research-shelf", { auth: true });
49: await apiRequest(`/api/workspace/research-shelf/${edit.dataset.editShelf}`, { method: "PATCH", auth: true, body: { note, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) } }); await loadShelf();
50: } else if (remove && window.confirm("Remove this source from your shelf?")) { await apiRequest(`/api/workspace/research-shelf/${remove.dataset.deleteShelf}`, { method: "DELETE", auth: true }); await loadShelf(); }
53: shelfExport?.addEventListener("click", (event) => { event.preventDefault(); fetch(shelfExport.href, { headers: { Authorization: `Bearer ${getToken()}` } }).then(async (response) => { if (!response.ok) throw new Error(); const link = document.createElement("a"); link.href = URL.createObjectURL(await response.blob()); link.download = "emora-research-shelf.json"; link.click(); URL.revokeObjectURL(link.href); }).catch(() => alert("Could not export your shelf.")); });
```

### app/static/js/emora-vrma-controller.js

```
23: const response = await fetch("/static/animations/meet/manifest.json?v=20260908");
```

### app/static/js/login.js

```
73: const response = await apiRequest("/api/auth/login", {
102: const payload = await apiRequest("/api/auth/google", {
```

### app/static/js/together.js

```
116: const payload = await apiRequest("/api/together", { auth: true, cache: "no-store" });
127: try { const payload = await apiRequest(path, { ...options, auth: true }); showStatus(elements.status, success || payload.message || "Updated.", "success"); return payload; }
133: try { await apiRequest("/api/together/presence", { method: "POST", auth: true, body: { visibility: state.presence }, cache: "no-store" }); }
```

### app/static/js/payment.js

```
109: const data = await apiRequest(`/api/billing/admin/users?search=${encodeURIComponent(search)}`, { auth: true });
182: const response = await apiRequest("/api/billing/checkout", { method: "POST", auth: true, body: { plan: state.plan, cycle: state.cycle, paymentMethod: state.method } });
204: const response = await apiRequest(`/api/billing/admin/users/${row.dataset.adminUser}/subscription`, { method: "PATCH", auth: true, body: { plan: row.querySelector("[data-admin-plan]").value, status: row.querySelector("[data-admin-status]").value } });
218: const catalog = await apiRequest("/api/billing/plans");
229: const access = await apiRequest("/api/billing/access", { auth: true });
```

### app/static/js/personal.js

```
84: const data = await apiRequest(isJournal ? "/api/personal/journal" : "/api/personal/goals", { auth: true });
143: await apiRequest(endpoint, { method: (isJournal && editingJournalId) || (!isJournal && editingGoalId) ? "PATCH" : "POST", auth: true, body });
198: await apiRequest(`${isJournal ? "/api/personal/journal" : "/api/personal/goals"}/${deleteButton.dataset.delete}`, { method: "DELETE", auth: true });
201: if (completeButton) await apiRequest(`/api/personal/goals/${completeButton.dataset.complete}/complete?expectedVersion=${goalEntries.find((item) => item.id === completeButton.dataset.complete)?.version || 1}`, { method: "PATCH", auth: true });
202: if (reopenButton) await apiRequest(`/api/personal/goals/${reopenButton.dataset.reopen}/reopen?expectedVersion=${goalEntries.find((item) => item.id === reopenButton.dataset.reopen)?.version || 1}`, { method: "PATCH", auth: true });
203: if (pauseButton) await apiRequest(`/api/personal/goals/${pauseButton.dataset.pause}/pause?expectedVersion=${goalEntries.find((item) => item.id === pauseButton.dataset.pause)?.version || 1}`, { method: "PATCH", auth: true });
204: if (archiveButton) await apiRequest(`/api/personal/goals/${archiveButton.dataset.archive}/archive?expectedVersion=${goalEntries.find((item) => item.id === archiveButton.dataset.archive)?.version || 1}`, { method: "PATCH", auth: true });
206: await apiRequest(`/api/personal/goals/${tinyButton.dataset.tiny}/tiny-thing?expectedVersion=${goalEntries.find((item) => item.id === tinyButton.dataset.tiny)?.version || 1}`, { method: "PATCH", auth: true });
```

### app/static/js/atmosphere.js

```
1: const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
57: return fetch(url, { headers: { Accept: "application/json" } })
```

### app/static/js/your-emora.js

```
402: void apiRequest(`/api/chat/turns/${encodeURIComponent(activeClientTurnId)}/cancel`, {
966: const response = await fetch("/api/voices/speak", {
1084: const response = await fetch("/api/chat/stream", {
1186: const decision = await apiRequest("/api/chat/search-decision", {
1220: await apiRequest(`/api/premium/sessions/${encodeURIComponent(ENTRY_SESSION_ID)}`, { method: "PATCH", auth: true, body: { conversationId: state.conversationId, status: "active" } });
1266: void apiRequest(`/api/chat/turns/${encodeURIComponent(clientTurnId)}/cancel`, { method: "POST", auth: true }).catch(() => {});
```

### app/static/js/public-status.js

```
4: fetch("/api/public/status", { cache: "no-store" })
```

### app/static/js/common.js

```
63: fetch("/health", { cache: "no-store" })
75: apiRequest("/api/play/progress", { auth: true, cache: "no-store" })
88: const response = await apiRequest("/api/together/presence", { method: "POST", auth: true, body: { visibility }, cache: "no-store" });
467: const response = await apiRequest("/api/workspace/notifications?unreadOnly=true&limit=1", { auth: true, cache: "no-store" });
511: await apiRequest("/api/auth/logout", { method: "POST", auth: true });
530: export async function apiRequest(path, options = {}) {
542: const response = await fetch(path, {
573: const response = await apiRequest("/api/auth/verify", { auth: true });
```

### app/static/js/community.js

```
278: const response = await apiRequest(`/posts?page=${state.page}&limit=${state.limit}`, {
333: const response = await apiRequest(`/posts/${state.reportingPostId}/report`, {
365: const response = await apiRequest("/posts", {
410: const response = await apiRequest(`/posts/${postId}`, {
431: const response = await apiRequest(`/posts/${postId}`, {
454: const response = await apiRequest(`/posts/${postId}/like`, {
548: try { await apiRequest(`/posts/${muteButton.dataset.mutePostId}/mute`, { method: "POST", auth: true }); await loadPosts(); }
555: try { await apiRequest(`/posts/${blockButton.dataset.blockPostId}/block-author`, { method: "POST", auth: true }); await loadPosts(); }
562: try { const response = await apiRequest(`/posts/${appealButton.dataset.appealPostId}/appeal`, { method: "POST", auth: true }); showStatus(elements.feedStatus, response.message, "success"); await loadPosts(); }
```

### app/static/js/dashboard.js

```
631: state.conversations = await apiRequest(`/api/chat?${params.toString()}`, { auth: true });
649: const response = await apiRequest("/api/workspace/collections", { auth: true });
655: const conversation = await apiRequest("/api/chat/conversations", {
677: const updated = await apiRequest(`/api/chat/conversations/${conversationId}`, { method: "PATCH", auth: true, body: { pinned: !conversation.pinned, expectedVersion: conversation.version || 1 } });
686: await apiRequest(`/api/chat/conversations/${conversationId}`, {
776: const response = await fetch(`/api/chat/conversations/${encodeURIComponent(conversation.id)}/export?format=text`, {
807: const response = await apiRequest("/api/chat/attachments", {
817: const response = await fetch(`/api/chat/attachments/${encodeURIComponent(attachmentId)}`, {
832: const response = await fetch(`/api/play/postcard/${encodeURIComponent(conversation.id)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
872: const response = await apiRequest("/api/experiences/space", { method: "PUT", auth: true, body: { environment: name } });
889: apiRequest("/api/companion/memories", { auth: true }),
890: apiRequest("/api/play/space", { auth: true }),
891: apiRequest("/api/personal/preferences", { auth: true }),
892: apiRequest("/api/experiences/space", { auth: true }),
923: const remix = await apiRequest("/api/play/remix", { method: "POST", auth: true, body: { text: transcript, format: "journal" } });
935: openExternal(`https://wa.me/?text=${encodeURIComponent(text)}`);
942: openExternal(`https://x.com/intent/tweet?text=${encodeURIComponent(xText)}`);
998: const decision = await apiRequest("/api/chat/search-decision", {
1008: const response = await apiRequest("/api/chat", {
1029: await apiRequest(`/api/premium/sessions/${encodeURIComponent(ENTRY_SESSION_ID)}`, { method: "PATCH", auth: true, body: { conversationId: response.conversation.id, status: "active" } });
1167: const updated = await apiRequest(`/api/chat/conversations/${conversation.id}`, { method: "PATCH", auth: true, body: { companionMode: nextMode, expectedVersion: conversation.version || 1 } });
1184: await apiRequest("/api/personal/check-ins", { method: "POST", auth: true, body: { mood: button.dataset.arrivalMood } });
1213: await apiRequest("/api/play/space", { method: "PUT", auth: true, body: state.space });
1230: await apiRequest(`/api/companion/memories/${editButton.dataset.editMemory}`, { method: "PATCH", auth: true, body: { value } });
1241: await apiRequest(`/api/companion/memories/${button.dataset.forgetMemory}`, { method: "DELETE", auth: true });
1256: await apiRequest("/api/companion/memories", { method: "POST", auth: true, body: { value } });
1279: const result = await apiRequest("/api/companion/reflections", { method: "POST", auth: true, body: { conversationId: conversation.id } });
1292: try { await apiRequest(`/api/chat/turns/${encodeURIComponent(clientTurnId)}/cancel`, { method: "POST", auth: true }); } catch { /* The local abort remains available if cancellation acknowledgement fails. */ }
1339: await apiRequest("/api/workspace/research-shelf", { method: "POST", auth: true, body: { title: sourceButton.dataset.sourceTitle, url: sourceButton.dataset.sourceUrl, domain: sourceButton.dataset.sourceDomain, note: "", tags: [] } });
1348: await apiRequest("/api/workspace/feedback", { method: "PUT", auth: true, body: { conversationId: conversation.id, messageId: feedbackButton.dataset.feedbackMessage, reason: feedbackButton.dataset.feedbackReason } });
1358: const result = await apiRequest("/api/experiences/moments", { method: "POST", auth: true, body: { conversationId: conversation.id, messageId: momentButton.dataset.saveMoment, category: "memory" } });
1392: const response = await apiRequest("/api/workspace/collections", { method: "POST", auth: true, body: { name: elements.collectionInput.value } });
1400: const response = await apiRequest(`/api/workspace/collections/${input.dataset.collectionId}/conversation`, { method: "PUT", auth: true, body: { conversationId: state.activeConversationId, included: input.checked } });
1409: try { await apiRequest(`/api/workspace/collections/${button.dataset.deleteCollection}`, { method: "DELETE", auth: true }); state.collections = state.collections.filter((item) => item.id !== button.dataset.deleteCollection); renderCollections(); }
```

### app/static/js/emora-sessions.js

```
36: const [current, history] = await Promise.all([apiRequest("/api/premium/sessions/current", { auth: true }), apiRequest("/api/premium/sessions?limit=20", { auth: true })]);
50: const payload = await apiRequest("/api/premium/weekly-review", { auth: true });
67: const payload = await apiRequest("/api/premium/memory-center", { auth: true });
81: const session = (await apiRequest("/api/premium/sessions", { method: "POST", auth: true, body: {
104: await apiRequest(`/api/premium/sessions/${encodeURIComponent(state.current.id)}/complete`, { method: "POST", auth: true, body: { reflection: byId("session-reflection").value, nextStep: byId("session-next-step").value, memoryChoice: byId("session-memory-review").checked ? "review" : "none" } });
118: const payload = await apiRequest("/api/premium/weekly-review", { method: "PUT", auth: true, body: { meaningful: byId("weekly-meaningful").value, changed: byId("weekly-changed").value, remember: byId("weekly-remember").value, forget: byId("weekly-forget").value, nextStep: byId("weekly-next-step").value } });
133: await apiRequest(`/api/premium/memory-center/${row.dataset.memoryId}`, { method: "PATCH", auth: true, body: { value: value.trim() } });
137: await apiRequest(`/api/premium/memory-center/${row.dataset.memoryId}`, { method: "PATCH", auth: true, body: { expiresInDays: days } });
140: await apiRequest(`/api/premium/memory-center/${row.dataset.memoryId}`, { method: "DELETE", auth: true });
```

### app/static/js/focus-together.js

```
202: const response = await fetch(`/api/play/focus-rooms/${encodeURIComponent(code)}/events?connection_id=${encodeURIComponent(state.connectionId)}`, {
244: const result = await apiRequest(`/api/play/focus-rooms/current?connection_id=${encodeURIComponent(state.connectionId)}`, { auth: true, cache: "no-store" });
295: const result = await apiRequest("/api/play/focus-rooms", {
325: const result = await apiRequest("/api/play/focus-rooms/join", {
350: const result = await apiRequest(`/api/play/focus-rooms/${encodeURIComponent(state.activeRoom.code)}/messages`, {
423: const result = await apiRequest(`/api/play/focus-rooms/${encodeURIComponent(state.activeRoom.code)}/reflection`, { method: "POST", auth: true });
438: const result = await apiRequest(`/api/play/focus-rooms/${encodeURIComponent(state.activeRoom.code)}/end`, { method: "POST", auth: true });
```

### app/static/js/notifications.js

```
255: const response = await apiRequest("/api/workspace/notifications?limit=100", { auth: true, cache: "no-store" });
298: await apiRequest(`/api/workspace/notifications/categories/${encodeURIComponent(button.dataset.notificationUnmute)}/mute`, { method: "PUT", body: { muted: false }, auth: true });
314: await apiRequest(`/api/workspace/notifications/categories/${encodeURIComponent(category)}/mute`, { method: "PUT", body: { muted: true }, auth: true });
321: await apiRequest(`/api/workspace/notifications/${open.dataset.notificationOpen}/read`, { method: "PATCH", auth: true });
327: await apiRequest(`/api/workspace/notifications/${read.dataset.notificationRead}/read`, { method: "PATCH", auth: true });
334: await apiRequest(`/api/workspace/notifications/${responseButton.dataset.notificationResponse}/respond`, { method: "PATCH", body: { response }, auth: true });
338: if (dismiss) await apiRequest(`/api/workspace/notifications/${dismiss.dataset.notificationDismiss}`, { method: "DELETE", auth: true });
360: await apiRequest(`/api/workspace/notifications/${id}/read`, { method: "PATCH", auth: true });
370: await apiRequest("/api/workspace/notifications/read-all", { method: "POST", auth: true });
```

### app/services/google_auth.py

```
11: GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
46: response = await client.post("https://oauth2.googleapis.com/token", data=payload)
```

### app/services/web_search.py

```
158: async def fetch(self, url: str) -> str:
195: response = await client.get(
196: "https://api.search.brave.com/res/v1/web/search",
239: response = await client.post("https://api.tavily.com/search", json=payload)
274: response = await client.get("https://html.duckduckgo.com/html/", params={"q": focused, "kl": "us-en"})
```
