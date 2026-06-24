import { SITE_CONFIG } from "../config.js";
import { createDataService, createDemoFallbackService } from "./data-service.js";

let page = "home";
let elements = {};

const state = {
  service: null,
  mode: "demo",
  ready: false,
  connectionError: null,
  user: null,
  profile: null,
  poems: [],
  comments: [],
  activePoemId: null,
  editingPoemId: null,
  authMode: "login",
  composeTags: [],
  filters: {
    scope: "all",
    sort: "new",
    tags: [],
  },
};

document.addEventListener("DOMContentLoaded", () => {
  initialize().catch((error) => {
    console.error(error);
    showToast(error.message ?? "初期化に失敗しました。", "error");
  });
});

async function initialize() {
  page = document.body?.dataset.page ?? "home";
  elements = collectElements();

  if (elements.siteName && page === "home") {
    elements.siteName.textContent = SITE_CONFIG.siteName;
  }
  if (elements.siteTagline && page === "home") {
    elements.siteTagline.textContent = SITE_CONFIG.siteTagline;
  }

  bindEvents();
  applyQueryFilters();

  try {
    state.service = await createDataService();
    state.mode = state.service.mode;
    await state.service.initialize();
    state.service.subscribeAuth(handleAuthChanged);
    await syncUserState();
    await refreshPoems();
  } catch (error) {
    console.error(error);
    state.connectionError = error?.message ?? "Firebase に接続できませんでした。";
    state.service = await createDemoFallbackService();
    state.mode = state.service.mode;
    await state.service.initialize();
    state.service.subscribeAuth(handleAuthChanged);
    await syncUserState();
    await refreshPoems();
    showToast(
      `Firebase に接続できなかったため、デモモードで表示しています。${error?.message ? ` 理由: ${error.message}` : ""}`,
      "error",
    );
  }

  state.ready = true;
  hydratePageStateFromQuery();
  renderAll();

  const hashMatch = location.hash.match(/^#poem-(.+)$/);
  if (hashMatch) {
    await openPoem(hashMatch[1]);
  }
}

function bindEvents() {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("submit", handleDocumentSubmit);

  if (elements.searchInput) {
    elements.searchInput.addEventListener("keydown", handleBrowseTagInputKeydown);
  }

  if (elements.sortFilter) {
    elements.sortFilter.addEventListener("change", (event) => {
      state.filters.sort = event.target.value;
      renderBrowseGrid();
    });
  }

  if (elements.poemTagInput) {
    elements.poemTagInput.addEventListener("keydown", handleComposeTagInputKeydown);
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePoemModal();
      closeAuthModal();
    }
  });
}

function collectElements() {
  return {
    siteName: document.getElementById("site-name"),
    siteTagline: document.getElementById("site-tagline"),
    modePill: document.getElementById("mode-pill"),
    poemCount: document.getElementById("poem-count"),
    authorCount: document.getElementById("author-count"),
    commentCount: document.getElementById("comment-count"),
    authActions: document.getElementById("auth-actions"),
    scopeSwitch: document.getElementById("scope-switch"),
    searchInput: document.getElementById("search-input"),
    sortFilter: document.getElementById("sort-filter"),
    poemGrid: document.getElementById("poem-grid"),
    activeFilterChip: document.getElementById("active-filter-chip"),
    clearTagButton: document.getElementById("clear-tag-button"),
    composeHeading: document.getElementById("compose-heading"),
    composeStatus: document.getElementById("compose-status"),
    composeForm: document.getElementById("compose-form"),
    poemTitle: document.getElementById("poem-title"),
    poemGenre: document.getElementById("poem-genre"),
    poemTags: document.getElementById("poem-tags"),
    poemTagInput: document.getElementById("poem-tag-input"),
    poemBody: document.getElementById("poem-body"),
    submitPoemButton: document.getElementById("submit-poem-button"),
    cancelEditButton: document.getElementById("cancel-edit-button"),
    profileCard: document.getElementById("profile-card"),
    tagCloud: document.getElementById("tag-cloud"),
    composeTagList: document.getElementById("compose-tag-list"),
    browseTagList: document.getElementById("browse-tag-list"),
    homeNewGrid: document.getElementById("home-new-grid"),
    homePopularGrid: document.getElementById("home-popular-grid"),
    homeAccountCard: document.getElementById("home-account-card"),
    browseAccountCard: document.getElementById("browse-account-card"),
    composeAccountCard: document.getElementById("compose-account-card"),
    composeTagSuggestions: document.getElementById("compose-tag-suggestions"),
    poemModal: document.getElementById("poem-modal"),
    poemModalBody: document.getElementById("poem-modal-body"),
    authModal: document.getElementById("auth-modal"),
    authModalBody: document.getElementById("auth-modal-body"),
    toastStack: document.getElementById("toast-stack"),
  };
}

function applyQueryFilters() {
  const params = new URLSearchParams(location.search);
  const scope = params.get("scope");
  const sort = params.get("sort");
  const tags = params.getAll("tag");
  if (scope === "mine") {
    state.filters.scope = "mine";
  }
  if (sort === "new" || sort === "popular") {
    state.filters.sort = sort;
  }
  if (tags.length) {
    state.filters.tags = normalizeTags(tags);
  }
}

function hydratePageStateFromQuery() {
  const params = new URLSearchParams(location.search);
  const editId = params.get("edit");

  if (page === "browse") {
    if (elements.sortFilter) {
      elements.sortFilter.value = state.filters.sort;
    }
  }

  if (page === "compose" && editId) {
    const poem = state.poems.find((item) => item.id === editId);
    if (poem && poem.isMine) {
      state.editingPoemId = poem.id;
      state.composeTags = [...poem.tags];
      fillComposeForm(poem);
    }
  }
}

async function handleAuthChanged() {
  await syncUserState();
  await refreshPoems();
  renderAll();
}

async function syncUserState() {
  state.user = await state.service.getCurrentUser();
  state.profile = await state.service.getCurrentProfile();
}

async function refreshPoems() {
  state.poems = await state.service.listPoems();

  if (state.activePoemId) {
    const poemStillExists = state.poems.some((poem) => poem.id === state.activePoemId);
    if (!poemStillExists) {
      closePoemModal();
    }
  }
}

function renderAll() {
  renderMode();
  renderStats();
  renderAuthActions();
  renderScopeButtons();
  renderHomePage();
  renderBrowsePage();
  renderComposePage();
  renderMyPage();
  renderAuthModal();
}

function renderMode() {
  if (!elements.modePill) {
    return;
  }
  if (!state.ready) {
    elements.modePill.textContent = "接続確認中";
    return;
  }
  elements.modePill.textContent = state.connectionError
    ? "Firebase接続失敗のためデモ表示中"
    : state.mode === "firebase"
      ? "Firebaseで公開中"
      : "ローカルデモで表示中";
}

function renderStats() {
  if (!elements.poemCount || !elements.authorCount || !elements.commentCount) {
    return;
  }

  const authors = new Set(state.poems.map((poem) => poem.authorId));
  const commentCount = state.poems.reduce((sum, poem) => sum + poem.commentCount, 0);
  elements.poemCount.textContent = String(state.poems.length);
  elements.authorCount.textContent = String(authors.size);
  elements.commentCount.textContent = String(commentCount);
}

function renderAuthActions() {
  if (!elements.authActions) {
    return;
  }

  if (!state.ready) {
    elements.authActions.innerHTML = `
      <button class="button button--ghost" data-action="open-auth" type="button">ログイン</button>
    `;
    return;
  }

  if (!state.user || !state.profile) {
    elements.authActions.innerHTML = `
      <button class="button button--ghost" data-action="open-auth" type="button">
        ${state.mode === "firebase" ? "ログイン" : "デモ参加"}
      </button>
    `;
    return;
  }

  elements.authActions.innerHTML = `
    <span class="muted-note">${escapeHtml(state.profile.displayName)} でログイン中</span>
    <a class="button button--ghost" href="./mypage.html">マイページ</a>
    <button class="button button--ghost" data-action="sign-out" type="button">ログアウト</button>
  `;
}

function renderScopeButtons() {
  if (!elements.scopeSwitch) {
    return;
  }
  for (const button of elements.scopeSwitch.querySelectorAll("[data-scope]")) {
    button.classList.toggle("chip--active", button.dataset.scope === state.filters.scope);
  }
}

function renderHomePage() {
  if (!elements.homeNewGrid && !elements.homePopularGrid && !elements.homeAccountCard) {
    return;
  }

  if (elements.homeNewGrid) {
    elements.homeNewGrid.innerHTML = renderPoemCards(getSortedPoems("new").slice(0, 1), {
      emptyMessage: "まだ作品がありません。",
      compact: true,
    });
  }

  if (elements.homePopularGrid) {
    elements.homePopularGrid.innerHTML = renderPoemCards(getSortedPoems("popular").slice(0, 1), {
      emptyMessage: "人気作品はまだありません。",
      compact: true,
    });
  }

  if (elements.homeAccountCard) {
    elements.homeAccountCard.innerHTML = renderAccountSummary({
      heading: "アカウント",
      descriptionLoggedOut:
        state.mode === "firebase"
          ? "ログインすると投稿・コメント・いいねができます。"
          : "デモ参加すると、このブラウザ内で投稿を試せます。",
    });
  }
}

function renderBrowsePage() {
  if (!elements.poemGrid && !elements.browseAccountCard && !elements.tagCloud) {
    return;
  }

  renderBrowseGrid();

  if (elements.browseAccountCard) {
    elements.browseAccountCard.innerHTML = renderAccountSummary({
      heading: "ログイン状態",
      descriptionLoggedOut: "ログインすると自分の作品だけを絞り込めます。",
    });
  }

  if (elements.tagCloud) {
    renderTagCloud();
  }
}

function renderComposePage() {
  if (!elements.composeForm && !elements.composeAccountCard) {
    return;
  }

  renderComposeCard();

  if (elements.composeAccountCard) {
    elements.composeAccountCard.innerHTML = renderAccountSummary({
      heading: "投稿状態",
      descriptionLoggedOut: "投稿するにはログインが必要です。",
    });
  }
}

function renderMyPage() {
  if (!elements.profileCard) {
    return;
  }

  if (!state.user || !state.profile) {
    elements.profileCard.innerHTML = `
      <div class="section-heading">
        <div>
          <p class="section-heading__eyebrow">Profile</p>
          <h2>ログインが必要です</h2>
        </div>
      </div>
      <p class="section-copy">マイページを使うにはログインしてください。</p>
      <div class="profile-actions">
        <button class="button" data-action="open-auth" type="button">
          ${state.mode === "firebase" ? "登録 / ログイン" : "デモ参加"}
        </button>
      </div>
    `;
    return;
  }

  const myPoems = getMyPoems();
  const poemListMarkup = myPoems.length
    ? `<div class="my-poem-list">${myPoems
        .map(
          (poem) => `
            <article class="mini-card">
              <h4>${escapeHtml(poem.title)}</h4>
              <p>${escapeHtml(shorten(poem.body, 110))}</p>
              <div class="mini-tags">
                <span class="tag-pill">${escapeHtml(poem.genre)}</span>
                <span class="tag-pill">${formatDate(poem.createdAt)}</span>
              </div>
              <div class="profile-actions">
                <button class="link-button" data-action="edit-poem" data-poem-id="${poem.id}" type="button">編集</button>
                <button class="link-button" data-action="delete-poem" data-poem-id="${poem.id}" type="button">削除</button>
                <button class="link-button" data-action="open-poem" data-poem-id="${poem.id}" type="button">詳細</button>
              </div>
            </article>
          `,
        )
        .join("")}</div>`
    : `<div class="empty-state">まだ自分の作品がありません。投稿ページから最初の詩を書いてください。</div>`;

  elements.profileCard.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="section-heading__eyebrow">Profile</p>
        <h2>マイページ</h2>
      </div>
    </div>
    <div class="profile-shell">
      <div class="profile-summary">
        <h3>${escapeHtml(state.profile.displayName)}</h3>
        <p>${escapeHtml(state.profile.bio || "自己紹介はまだありません。")}</p>
        <p class="muted-note">自分の作品: ${myPoems.length}件</p>
      </div>
      <form id="profile-form" class="stack-form">
        <label class="field">
          <span>表示名</span>
          <input name="displayName" type="text" maxlength="30" value="${escapeAttribute(state.profile.displayName)}" required>
        </label>
        <label class="field">
          <span>自己紹介</span>
          <textarea name="bio" rows="4" maxlength="200">${escapeHtml(state.profile.bio ?? "")}</textarea>
        </label>
        <div class="form-actions">
          <button class="button" type="submit">プロフィールを保存</button>
          <a class="button button--ghost" href="./compose.html">投稿ページへ</a>
        </div>
      </form>
      <div>
        <div class="section-heading">
          <div>
            <p class="section-heading__eyebrow">My Poems</p>
            <h2>自分の作品一覧</h2>
          </div>
        </div>
        ${poemListMarkup}
      </div>
    </div>
  `;
}

function renderBrowseGrid() {
  if (!elements.poemGrid) {
    return;
  }

  if (!state.ready) {
    elements.poemGrid.innerHTML = '<div class="empty-state">作品一覧を読み込んでいます...</div>';
    return;
  }

  const poems = getFilteredPoems();

  if (elements.activeFilterChip) {
    if (state.filters.tags.length) {
      elements.activeFilterChip.hidden = false;
      elements.activeFilterChip.textContent = `検索タグ: ${state.filters.tags.map((tag) => `#${tag}`).join(" / ")}`;
    } else {
      elements.activeFilterChip.hidden = true;
    }
  }

  if (elements.clearTagButton) {
    elements.clearTagButton.hidden = state.filters.tags.length === 0;
  }

  renderBrowseTagList();

  elements.poemGrid.innerHTML = renderPoemCards(poems, {
    emptyMessage: "そのタグに合う作品がありません。別のタグを試すか、新しい作品を投稿してください。",
  });
}

function renderComposeCard() {
  if (!elements.composeForm) {
    return;
  }

  const isEditing = Boolean(state.editingPoemId);
  if (elements.composeHeading) {
    elements.composeHeading.textContent = isEditing ? "詩を編集" : "新しい詩を投稿";
  }
  if (elements.cancelEditButton) {
    elements.cancelEditButton.hidden = !isEditing;
  }

  if (elements.composeStatus) {
    if (!state.user || !state.profile) {
      elements.composeStatus.textContent =
        state.mode === "firebase"
          ? "メールアドレスとパスワードでログインすると作品を投稿できます。"
          : "デモ参加すると、このブラウザ内で投稿を試せます。";
    } else {
      elements.composeStatus.textContent = `${state.profile.displayName} として投稿中です。`;
    }
  }

  const canPost = Boolean(state.user && state.profile);
  if (elements.submitPoemButton) {
    elements.submitPoemButton.textContent = isEditing ? "更新する" : "投稿する";
  }
  for (const field of [
    elements.poemTitle,
    elements.poemGenre,
    elements.poemTags,
    elements.poemTagInput,
    elements.poemBody,
    elements.submitPoemButton,
  ]) {
    if (field) {
      field.disabled = !canPost;
    }
  }

  syncComposeTagsField();
  renderComposeTagList();
  renderComposeTagSuggestions();
}

function renderTagCloud() {
  if (!elements.tagCloud) {
    return;
  }

  const tags = collectTagCounts(state.poems);
  if (!tags.length) {
    elements.tagCloud.innerHTML =
      '<p class="muted-note">作品が増えるとタグがここに表示されます。</p>';
    return;
  }

  elements.tagCloud.innerHTML = tags
    .slice(0, 16)
    .map(
      ([tag, count]) => `
        <button class="chip ${state.filters.tags.includes(tag) ? "chip--active" : ""}" data-action="select-tag" data-tag="${escapeAttribute(tag)}" type="button">
          #${escapeHtml(tag)} (${count})
        </button>
      `,
    )
    .join("");
}

function renderComposeTagSuggestions() {
  if (!elements.composeTagSuggestions) {
    return;
  }

  const tags = collectTagCounts(state.poems);
  if (!tags.length) {
    elements.composeTagSuggestions.innerHTML = "";
    return;
  }

  elements.composeTagSuggestions.innerHTML = tags
    .slice(0, 12)
    .map(
      ([tag, count]) => `
        <button class="chip ${state.composeTags.includes(tag) ? "chip--active" : ""}" data-action="add-compose-tag" data-tag="${escapeAttribute(tag)}" type="button">
          #${escapeHtml(tag)} (${count})
        </button>
      `,
    )
    .join("");
}

function renderComposeTagList() {
  if (!elements.composeTagList) {
    return;
  }

  elements.composeTagList.innerHTML = state.composeTags
    .map(
      (tag) => `
        <button class="tag-token" data-action="remove-compose-tag" data-tag="${escapeAttribute(tag)}" type="button">
          <span>#${escapeHtml(tag)}</span>
          <span class="tag-token__remove">×</span>
        </button>
      `,
    )
    .join("");
}

function renderBrowseTagList() {
  if (!elements.browseTagList) {
    return;
  }

  elements.browseTagList.innerHTML = state.filters.tags
    .map(
      (tag) => `
        <button class="tag-token" data-action="remove-search-tag" data-tag="${escapeAttribute(tag)}" type="button">
          <span>#${escapeHtml(tag)}</span>
          <span class="tag-token__remove">×</span>
        </button>
      `,
    )
    .join("");
}

function renderAccountSummary({ heading, descriptionLoggedOut }) {
  if (!state.ready) {
    return `
      <div class="section-heading">
        <div>
          <p class="section-heading__eyebrow">Account</p>
          <h2>${heading}</h2>
        </div>
      </div>
      <p class="section-copy">読み込み中です...</p>
    `;
  }

  if (!state.user || !state.profile) {
    return `
      <div class="section-heading">
        <div>
          <p class="section-heading__eyebrow">Account</p>
          <h2>${heading}</h2>
        </div>
      </div>
      <p class="section-copy">${escapeHtml(descriptionLoggedOut)}</p>
      ${
        state.connectionError
          ? `<p class="muted-note">現在は Firebase に接続できず、デモモードで表示しています。理由: ${escapeHtml(state.connectionError)}</p>`
          : ""
      }
      <div class="profile-actions">
        <button class="button" data-action="open-auth" type="button">
          ${state.mode === "firebase" ? "登録 / ログイン" : "デモ参加"}
        </button>
      </div>
    `;
  }

  const myPoems = getMyPoems();
  return `
    <div class="section-heading">
      <div>
        <p class="section-heading__eyebrow">Account</p>
        <h2>${heading}</h2>
      </div>
    </div>
    <div class="profile-summary">
      <h3>${escapeHtml(state.profile.displayName)} でログイン中</h3>
      <p>${escapeHtml(state.profile.bio || "自己紹介はまだありません。")}</p>
      <p class="muted-note">自分の作品: ${myPoems.length}件</p>
    </div>
    <div class="profile-actions">
      <a class="button button--ghost" href="./mypage.html">マイページ</a>
      <button class="button button--ghost" data-action="sign-out" type="button">ログアウト</button>
    </div>
  `;
}

function renderPoemCards(poems, { emptyMessage, compact = false } = {}) {
  if (!state.ready) {
    return '<div class="empty-state">作品を読み込んでいます...</div>';
  }

  if (!poems.length) {
    return `<div class="empty-state">${escapeHtml(emptyMessage ?? "作品がありません。")}</div>`;
  }

  return poems
    .map(
      (poem) => `
        <article class="poem-card ${compact ? "poem-card--compact" : ""}">
          <div class="poem-card__top">
            <div>
              <h3>${escapeHtml(poem.title)}</h3>
              <div class="poem-card__meta">
                <span class="meta-pair">${escapeHtml(poem.authorName)}</span>
                <span class="meta-pair">${formatDate(poem.createdAt)}</span>
                <span class="meta-pair">${escapeHtml(poem.genre)}</span>
              </div>
            </div>
            ${poem.isMine ? '<span class="tag-pill">自分の作品</span>' : ""}
          </div>
          <p class="poem-card__body">${escapeHtml(buildPreview(poem.body))}</p>
          <div class="poem-card__tags">
            ${poem.tags
              .map(
                (tag) =>
                  `<button class="tag-pill" data-action="select-tag" data-tag="${escapeAttribute(tag)}" type="button">#${escapeHtml(tag)}</button>`,
              )
              .join("")}
          </div>
          <div class="poem-card__actions">
            <button class="button button--ghost" data-action="open-poem" data-poem-id="${poem.id}" type="button">続きを読む</button>
            <button class="chip ${poem.likedByMe ? "chip--active" : ""}" data-action="toggle-like" data-poem-id="${poem.id}" type="button">
              いいね ${poem.likesCount}
            </button>
            <span class="muted-note">コメント ${poem.commentCount}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPoemModal() {
  if (!state.activePoemId || !elements.poemModalBody) {
    return;
  }

  const poem = state.poems.find((item) => item.id === state.activePoemId);
  if (!poem) {
    closePoemModal();
    return;
  }

  const commentSection = SITE_CONFIG.enableComments
    ? `
      <section class="comment-section">
        <div class="section-heading">
          <div>
            <p class="section-heading__eyebrow">Comments</p>
            <h2>感想</h2>
          </div>
        </div>
        ${
          state.comments.length
            ? `<div class="comment-list">${state.comments
                .map(
                  (comment) => `
                    <article class="comment-card">
                      <div class="comment-meta">
                        <span>${escapeHtml(comment.authorName)}</span>
                        <span>${formatDate(comment.createdAt)}</span>
                      </div>
                      <p>${escapeHtml(comment.body)}</p>
                    </article>
                  `,
                )
                .join("")}</div>`
            : `<div class="empty-state">まだコメントはありません。</div>`
        }
        ${
          state.user && state.profile
            ? `
              <form id="comment-form" class="stack-form">
                <input type="hidden" name="poemId" value="${poem.id}">
                <label class="field">
                  <span>コメントを書く</span>
                  <textarea name="body" rows="4" maxlength="300" required></textarea>
                </label>
                <div class="form-actions">
                  <button class="button" type="submit">コメントする</button>
                </div>
              </form>
            `
            : `
              <p class="muted-note">
                コメントするにはログインが必要です。
                <button class="link-button" data-action="open-auth" type="button">ログイン</button>
              </p>
            `
        }
      </section>
    `
    : "";

  elements.poemModalBody.innerHTML = `
    <div class="detail-header">
      <p class="section-heading__eyebrow">Poem Detail</p>
      <h2>${escapeHtml(poem.title)}</h2>
      <div class="poem-card__meta">
        <span>${escapeHtml(poem.authorName)}</span>
        <span>${formatDate(poem.createdAt)}</span>
        <span>${escapeHtml(poem.genre)}</span>
      </div>
      <div class="detail-tags">
        ${poem.tags
          .map(
            (tag) =>
              `<button class="tag-pill" data-action="select-tag" data-tag="${escapeAttribute(tag)}" type="button">#${escapeHtml(tag)}</button>`,
          )
          .join("")}
      </div>
      <div class="detail-actions">
        <button class="chip ${poem.likedByMe ? "chip--active" : ""}" data-action="toggle-like" data-poem-id="${poem.id}" type="button">
          いいね ${poem.likesCount}
        </button>
        ${
          poem.isMine
            ? `
              <button class="button button--ghost" data-action="edit-poem" data-poem-id="${poem.id}" type="button">編集</button>
              <button class="button button--ghost" data-action="delete-poem" data-poem-id="${poem.id}" type="button">削除</button>
            `
            : ""
        }
      </div>
    </div>
    <div class="detail-body">${escapeHtml(poem.body)}</div>
    ${commentSection}
  `;
}

function renderAuthModal() {
  if (!elements.authModalBody) {
    return;
  }

  if (state.mode === "firebase") {
    const isSignup = state.authMode === "signup";
    elements.authModalBody.innerHTML = `
      <div class="section-heading">
        <div>
          <p class="section-heading__eyebrow">Authentication</p>
          <h2>${isSignup ? "新規登録" : "ログイン"}</h2>
        </div>
      </div>
      <div class="scope-switch">
        <button class="chip ${isSignup ? "" : "chip--active"}" data-action="set-auth-mode" data-auth-mode="login" type="button">ログイン</button>
        <button class="chip ${isSignup ? "chip--active" : ""}" data-action="set-auth-mode" data-auth-mode="signup" type="button">新規登録</button>
      </div>
      <p class="section-copy">
        ${
          isSignup
            ? "Firebase Authentication のメールアドレス認証で、無料の公開コミュニティをすぐ開始できます。"
            : "登録済みのメールアドレスとパスワードでログインします。"
        }
      </p>
      <form id="auth-form" class="stack-form">
        <input type="hidden" name="authMode" value="${state.authMode}">
        ${
          isSignup
            ? `
              <label class="field">
                <span>表示名</span>
                <input name="displayName" type="text" maxlength="30" required>
              </label>
            `
            : ""
        }
        <label class="field">
          <span>メールアドレス</span>
          <input id="auth-email" name="email" type="email" autocomplete="email" required>
        </label>
        <label class="field">
          <span>パスワード</span>
          <input name="password" type="password" minlength="6" autocomplete="${isSignup ? "new-password" : "current-password"}" required>
        </label>
        <div class="form-actions">
          <button class="button" type="submit">${isSignup ? "新規登録する" : "ログインする"}</button>
          ${
            isSignup
              ? ""
              : `<button class="button button--ghost" data-action="request-password-reset" type="button">再設定メール</button>`
          }
        </div>
      </form>
      <p class="muted-note">パスワードは6文字以上にしてください。</p>
    `;
    return;
  }

  elements.authModalBody.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="section-heading__eyebrow">Demo Sign In</p>
        <h2>デモ参加</h2>
      </div>
    </div>
    <p class="section-copy">
      ここで作るアカウント情報は、このブラウザの \`localStorage\` にだけ保存されます。
    </p>
    <form id="auth-form" class="stack-form">
      <label class="field">
        <span>表示名</span>
        <input name="displayName" type="text" maxlength="30" required>
      </label>
      <label class="field">
        <span>自己紹介</span>
        <textarea name="bio" rows="4" maxlength="200"></textarea>
      </label>
      <div class="form-actions">
        <button class="button" type="submit">デモ参加する</button>
      </div>
    </form>
  `;
}

function getSortedPoems(sort) {
  const poems = [...state.poems];
  poems.sort((a, b) => {
    if (sort === "old") {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    if (sort === "popular") {
      return (
        b.likesCount - a.likesCount ||
        b.commentCount - a.commentCount ||
        new Date(b.createdAt) - new Date(a.createdAt)
      );
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  return poems;
}

function getFilteredPoems() {
  let poems = getSortedPoems(state.filters.sort);
  if (state.filters.scope === "mine") {
    poems = state.user ? poems.filter((poem) => poem.authorId === state.user.id) : [];
  }
  if (state.filters.tags.length) {
    poems = poems.filter((poem) =>
      state.filters.tags.some((tag) => poem.tags.includes(tag)),
    );
  }
  return poems;
}

function getMyPoems() {
  return state.user
    ? getSortedPoems("new").filter((poem) => poem.authorId === state.user.id)
    : [];
}

function collectTagCounts(poems) {
  const map = new Map();
  for (const poem of poems) {
    for (const tag of poem.tags) {
      map.set(tag, (map.get(tag) ?? 0) + 1);
    }
  }

  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function handleDocumentSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  try {
    if (form.id === "compose-form") {
      event.preventDefault();
      await submitPoem();
      return;
    }

    if (form.id === "auth-form") {
      event.preventDefault();
      await submitAuth(form);
      return;
    }

    if (form.id === "profile-form") {
      event.preventDefault();
      await submitProfile(form);
      return;
    }

    if (form.id === "comment-form") {
      event.preventDefault();
      await submitComment(form);
    }
  } catch (error) {
    console.error(error);
    showToast(error.message ?? "送信に失敗しました。", "error");
  }
}

async function handleDocumentClick(event) {
  const trigger = event.target.closest("[data-action], [data-scope]");
  if (!trigger) {
    return;
  }

  if (trigger.dataset.scope) {
    state.filters.scope = trigger.dataset.scope;
    renderScopeButtons();
    renderBrowseGrid();
    return;
  }

  const action = trigger.dataset.action;
  try {
    switch (action) {
      case "open-auth":
        openAuthModal();
        break;
      case "close-auth-modal":
        closeAuthModal();
        break;
      case "close-poem-modal":
        closePoemModal();
        break;
      case "clear-tag":
        state.filters.tags = [];
        clearBrowseTagInput();
        renderBrowseGrid();
        renderTagCloud();
        break;
      case "select-tag":
        toggleSearchTag(trigger.dataset.tag);
        if (page !== "browse") {
          location.href = buildPageUrl("browse.html", { tag: state.filters.tags });
          return;
        }
        clearBrowseTagInput();
        renderBrowseGrid();
        renderTagCloud();
        break;
      case "add-compose-tag":
        addComposeTag(trigger.dataset.tag);
        clearComposeTagInput();
        break;
      case "remove-compose-tag":
        removeComposeTag(trigger.dataset.tag);
        break;
      case "remove-search-tag":
        removeSearchTag(trigger.dataset.tag);
        break;
      case "open-poem":
        await openPoem(trigger.dataset.poemId);
        break;
      case "toggle-like":
        await toggleLike(trigger.dataset.poemId);
        break;
      case "edit-poem":
        beginEdit(trigger.dataset.poemId);
        break;
      case "delete-poem":
        await deletePoem(trigger.dataset.poemId);
        break;
      case "cancel-edit":
        clearComposeForm();
        break;
      case "sign-out":
        await state.service.signOut();
        showToast("ログアウトしました。", "success");
        break;
      case "set-auth-mode":
        state.authMode = trigger.dataset.authMode === "signup" ? "signup" : "login";
        renderAuthModal();
        break;
      case "request-password-reset":
        await requestPasswordReset();
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(error);
    showToast(error.message ?? "処理に失敗しました。", "error");
  }
}

async function submitPoem() {
  const wasEditing = Boolean(state.editingPoemId);
  if (!state.user) {
    openAuthModal();
    throw new Error("投稿にはログインが必要です。");
  }

  const poemId = await state.service.savePoem({
    id: state.editingPoemId,
    title: elements.poemTitle.value,
    genre: elements.poemGenre.value,
    tags: state.composeTags,
    body: elements.poemBody.value,
  });
  clearComposeForm();
  await refreshPoems();
  renderAll();
  showToast(wasEditing ? "作品を更新しました。" : "作品を投稿しました。", "success");
  await openPoem(poemId);
}

async function submitAuth(form) {
  const formData = new FormData(form);
  if (state.mode === "firebase") {
    const authMode = String(formData.get("authMode") ?? state.authMode);
    await state.service.signIn({
      mode: authMode,
      displayName: String(formData.get("displayName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    closeAuthModal();
    state.authMode = "login";
    showToast(authMode === "signup" ? "アカウントを作成しました。" : "ログインしました。", "success");
    return;
  }

  await state.service.signIn({
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? ""),
  });
  closeAuthModal();
  showToast("デモ参加しました。", "success");
}

async function submitProfile(form) {
  const formData = new FormData(form);
  state.profile = await state.service.updateProfile({
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? ""),
  });
  await refreshPoems();
  renderAll();
  showToast("プロフィールを保存しました。", "success");
}

async function submitComment(form) {
  const formData = new FormData(form);
  await state.service.addComment(
    String(formData.get("poemId") ?? ""),
    String(formData.get("body") ?? ""),
  );
  state.comments = await state.service.listComments(state.activePoemId);
  await refreshPoems();
  renderPoemModal();
  renderBrowseGrid();
  showToast("コメントを投稿しました。", "success");
  form.reset();
}

async function requestPasswordReset() {
  if (state.mode !== "firebase") {
    throw new Error("デモモードでは利用できません。");
  }

  if (!elements.authModalBody) {
    throw new Error("認証画面が開いていません。");
  }

  const emailInput = elements.authModalBody.querySelector("#auth-email");
  await state.service.requestPasswordReset(emailInput?.value ?? "");
  showToast("再設定メールを送信しました。受信箱を確認してください。", "success");
}

async function openPoem(poemId) {
  state.activePoemId = poemId;
  state.comments = SITE_CONFIG.enableComments
    ? await state.service.listComments(poemId)
    : [];
  renderPoemModal();
  if (elements.poemModal) {
    elements.poemModal.hidden = false;
  }
  syncBodyModalState();
  history.replaceState(null, "", `#poem-${poemId}`);
}

function closePoemModal() {
  state.activePoemId = null;
  state.comments = [];
  if (elements.poemModal) {
    elements.poemModal.hidden = true;
  }
  if (elements.poemModalBody) {
    elements.poemModalBody.innerHTML = "";
  }
  syncBodyModalState();
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

function openAuthModal() {
  renderAuthModal();
  if (elements.authModal) {
    elements.authModal.hidden = false;
  }
  syncBodyModalState();
}

function closeAuthModal() {
  if (elements.authModal) {
    elements.authModal.hidden = true;
  }
  syncBodyModalState();
}

async function toggleLike(poemId) {
  if (!state.user) {
    openAuthModal();
    return;
  }

  await state.service.toggleLike(poemId);
  await refreshPoems();
  renderAll();
  if (state.activePoemId === poemId) {
    renderPoemModal();
  }
}

function beginEdit(poemId) {
  const poem = state.poems.find((item) => item.id === poemId);
  if (!poem || !poem.isMine) {
    showToast("編集できるのは自分の作品だけです。", "error");
    return;
  }

  state.editingPoemId = poem.id;

  if (page !== "compose") {
    location.href = buildPageUrl("compose.html", { edit: poem.id });
    return;
  }

  fillComposeForm(poem);
  closePoemModal();
}

function fillComposeForm(poem) {
  if (!elements.poemTitle || !elements.poemGenre || !elements.poemTags || !elements.poemBody) {
    return;
  }

  elements.poemTitle.value = poem.title;
  elements.poemGenre.value = poem.genre;
  state.composeTags = [...poem.tags];
  syncComposeTagsField();
  renderComposeTagList();
  elements.poemBody.value = poem.body;
  renderComposeCard();
}

async function deletePoem(poemId) {
  const poem = state.poems.find((item) => item.id === poemId);
  if (!poem) {
    return;
  }
  if (!poem.isMine) {
    throw new Error("削除できるのは自分の作品だけです。");
  }

  const confirmed = window.confirm(`「${poem.title}」を削除します。元に戻せません。`);
  if (!confirmed) {
    return;
  }

  await state.service.deletePoem(poemId);
  if (state.editingPoemId === poemId) {
    clearComposeForm();
  }
  await refreshPoems();
  renderAll();
  closePoemModal();
  showToast("作品を削除しました。", "success");
}

function clearComposeForm() {
  state.editingPoemId = null;
  state.composeTags = [];
  if (elements.composeForm) {
    elements.composeForm.reset();
  }
  if (elements.poemGenre) {
    elements.poemGenre.value = "自由詩";
  }
  syncComposeTagsField();
  renderComposeTagList();
  renderComposeCard();
}

function buildPreview(body) {
  return shorten(body.replace(/\n{2,}/g, "\n").trim(), 160);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return [...new Set(tags.map((tag) => normalizeSingleTag(tag)).filter(Boolean))].slice(0, 8);
  }

  return [...new Set(
    String(tags ?? "")
      .split(/[,\n、]/)
      .map((tag) => normalizeSingleTag(tag))
      .filter(Boolean),
  )].slice(0, 8);
}

function normalizeSingleTag(tag) {
  return String(tag ?? "")
    .trim()
    .replace(/^#+/, "")
    .slice(0, 20);
}

function shorten(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function showToast(message, kind = "default") {
  if (!elements.toastStack) {
    return;
  }
  const toast = document.createElement("div");
  toast.className = `toast ${kind === "error" ? "toast--error" : ""} ${
    kind === "success" ? "toast--success" : ""
  }`.trim();
  toast.textContent = message;
  elements.toastStack.append(toast);
  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function syncBodyModalState() {
  const hasOpenModal =
    (elements.poemModal && !elements.poemModal.hidden) ||
    (elements.authModal && !elements.authModal.hidden);
  document.body.classList.toggle("modal-open", Boolean(hasOpenModal));
}

function buildPageUrl(pageName, query = {}) {
  const url = new URL(pageName, location.href);
  url.search = "";
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && item !== "") {
          url.searchParams.append(key, item);
        }
      }
      continue;
    }
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}`;
}

function handleComposeTagInputKeydown(event) {
  if (event.isComposing || event.keyCode === 229 || event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  const nextTag = normalizeSingleTag(event.target.value);
  if (!nextTag) {
    return;
  }
  addComposeTag(nextTag);
  clearComposeTagInput();
}

function handleBrowseTagInputKeydown(event) {
  if (event.isComposing || event.keyCode === 229 || event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  const nextTag = normalizeSingleTag(event.target.value);
  if (!nextTag) {
    return;
  }
  if (!state.filters.tags.includes(nextTag)) {
    state.filters.tags = [...state.filters.tags, nextTag];
  }
  clearBrowseTagInput();
  renderBrowseGrid();
  renderTagCloud();
}

function syncComposeTagsField() {
  if (elements.poemTags) {
    elements.poemTags.value = state.composeTags.join(", ");
  }
}

function removeComposeTag(tag) {
  state.composeTags = state.composeTags.filter((item) => item !== tag);
  syncComposeTagsField();
  renderComposeTagList();
  renderComposeTagSuggestions();
}

function removeSearchTag(tag) {
  state.filters.tags = state.filters.tags.filter((item) => item !== tag);
  clearBrowseTagInput();
  renderBrowseGrid();
  renderTagCloud();
}

function toggleSearchTag(tag) {
  if (!tag) {
    return;
  }
  if (state.filters.tags.includes(tag)) {
    state.filters.tags = state.filters.tags.filter((item) => item !== tag);
    return;
  }
  state.filters.tags = [...state.filters.tags, tag];
}

function addComposeTag(tag) {
  const nextTag = normalizeSingleTag(tag);
  if (!nextTag) {
    return;
  }
  if (state.composeTags.includes(nextTag)) {
    return;
  }
  if (state.composeTags.length >= 8) {
    showToast("タグは8個までです。", "error");
    return;
  }
  state.composeTags = [...state.composeTags, nextTag];
  syncComposeTagsField();
  renderComposeTagList();
  renderComposeTagSuggestions();
}

function clearComposeTagInput() {
  if (elements.poemTagInput) {
    forceClearInput(elements.poemTagInput);
  }
}

function clearBrowseTagInput() {
  if (elements.searchInput) {
    forceClearInput(elements.searchInput);
  }
}

function forceClearInput(input) {
  input.value = "";
  queueMicrotask(() => {
    input.value = "";
  });
  requestAnimationFrame(() => {
    input.value = "";
  });
  setTimeout(() => {
    input.value = "";
  }, 0);
  setTimeout(() => {
    input.value = "";
  }, 30);
}
