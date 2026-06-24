import { SITE_CONFIG, isFirebaseConfigured } from "../config.js";
import { DEMO_DATA } from "./demo-data.js";

const DEMO_STORAGE_KEY = "poetry-community-demo-v1";
const FIREBASE_VERSION = "12.15.0";
const FIREBASE_APP_URL =
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const FIREBASE_AUTH_URL =
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;
const FIREBASE_FIRESTORE_URL =
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`;
const GENRES = ["自由詩", "叙情詩", "散文詩", "短詩", "その他"];
const FIRESTORE_IN_QUERY_LIMIT = 30;

export async function createDataService() {
  if (isFirebaseConfigured()) {
    return createFirebaseService();
  }

  return createDemoService();
}

export async function createDemoFallbackService() {
  return createDemoService();
}

function createDemoService() {
  const listeners = new Set();

  function cloneDemoData() {
    return JSON.parse(JSON.stringify(DEMO_DATA));
  }

  function seedStore() {
    const demo = cloneDemoData();
    return {
      profiles: demo.profiles,
      poems: demo.poems,
      comments: demo.comments,
      likes: demo.likes,
      sessionUser: null,
    };
  }

  function readStore() {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      const store = seedStore();
      writeStore(store);
      return store;
    }

    return JSON.parse(raw);
  }

  function writeStore(store) {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
  }

  function emitAuth(user) {
    for (const callback of listeners) {
      callback(user);
    }
  }

  function getSessionUser(store = readStore()) {
    return store.sessionUser ? { ...store.sessionUser } : null;
  }

  function getProfileById(store, id) {
    return store.profiles.find((profile) => profile.id === id) ?? null;
  }

  function normalizeProfile(profile) {
    if (!profile) {
      return null;
    }

    return {
      id: profile.id,
      displayName: profile.displayName,
      bio: profile.bio ?? "",
      createdAt: profile.createdAt,
    };
  }

  function buildPoemRecord(poem, store, userId) {
    const author = getProfileById(store, poem.authorId);
    const likes = store.likes.filter((like) => like.poemId === poem.id);
    const comments = store.comments.filter((comment) => comment.poemId === poem.id);

    return {
      id: poem.id,
      authorId: poem.authorId,
      authorName: author?.displayName ?? "無名",
      title: poem.title,
      genre: poem.genre,
      tags: poem.tags ?? [],
      body: poem.body,
      createdAt: poem.createdAt,
      updatedAt: poem.updatedAt,
      likesCount: likes.length,
      commentCount: comments.length,
      likedByMe: Boolean(userId && likes.some((like) => like.userId === userId)),
      isMine: poem.authorId === userId,
    };
  }

  return {
    mode: "demo",
    genres: GENRES,
    async initialize() {
      readStore();
    },
    subscribeAuth(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async getCurrentUser() {
      return getSessionUser();
    },
    async getCurrentProfile() {
      const sessionUser = getSessionUser();
      if (!sessionUser) {
        return null;
      }

      return normalizeProfile(getProfileById(readStore(), sessionUser.id));
    },
    async signIn({ displayName, bio = "" }) {
      const name = displayName.trim();
      if (!name) {
        throw new Error("表示名を入力してください。");
      }

      const store = readStore();
      const existing = store.profiles.find(
        (profile) =>
          profile.displayName === name && profile.id.startsWith("demo-user-"),
      );
      const id = existing?.id ?? createId("demo-user");
      const profile = {
        id,
        displayName: name,
        bio: bio.trim(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      store.profiles = store.profiles.filter((item) => item.id !== id);
      store.profiles.push(profile);
      store.sessionUser = { id, email: null };
      writeStore(store);
      emitAuth({ ...store.sessionUser });
      return { user: { ...store.sessionUser }, profile: normalizeProfile(profile) };
    },
    async signOut() {
      const store = readStore();
      store.sessionUser = null;
      writeStore(store);
      emitAuth(null);
    },
    async updateProfile({ displayName, bio = "" }) {
      const store = readStore();
      const sessionUser = getSessionUser(store);
      if (!sessionUser) {
        throw new Error("ログインが必要です。");
      }

      const name = displayName.trim();
      if (!name) {
        throw new Error("表示名を入力してください。");
      }

      const profile = getProfileById(store, sessionUser.id);
      if (!profile) {
        throw new Error("プロフィールが見つかりません。");
      }

      profile.displayName = name;
      profile.bio = bio.trim();
      writeStore(store);
      return normalizeProfile(profile);
    },
    async listPoems() {
      const store = readStore();
      const userId = getSessionUser(store)?.id;
      return store.poems
        .map((poem) => buildPoemRecord(poem, store, userId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    async getPoem(id) {
      const store = readStore();
      const poem = store.poems.find((item) => item.id === id);
      const userId = getSessionUser(store)?.id;
      return poem ? buildPoemRecord(poem, store, userId) : null;
    },
    async savePoem({ id = null, title, genre, tags, body }) {
      const store = readStore();
      const sessionUser = getSessionUser(store);
      if (!sessionUser) {
        throw new Error("投稿にはログインが必要です。");
      }

      const payload = normalizePoemInput({ title, genre, tags, body });
      if (id) {
        const poem = store.poems.find((item) => item.id === id);
        if (!poem) {
          throw new Error("作品が見つかりません。");
        }
        if (poem.authorId !== sessionUser.id) {
          throw new Error("他の人の作品は編集できません。");
        }
        poem.title = payload.title;
        poem.genre = payload.genre;
        poem.tags = payload.tags;
        poem.body = payload.body;
        poem.updatedAt = new Date().toISOString();
        writeStore(store);
        return poem.id;
      }

      const poem = {
        id: createId("poem"),
        authorId: sessionUser.id,
        title: payload.title,
        genre: payload.genre,
        tags: payload.tags,
        body: payload.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.poems.unshift(poem);
      writeStore(store);
      return poem.id;
    },
    async deletePoem(id) {
      const store = readStore();
      const sessionUser = getSessionUser(store);
      if (!sessionUser) {
        throw new Error("ログインが必要です。");
      }

      const poem = store.poems.find((item) => item.id === id);
      if (!poem) {
        throw new Error("作品が見つかりません。");
      }
      if (poem.authorId !== sessionUser.id) {
        throw new Error("他の人の作品は削除できません。");
      }

      store.poems = store.poems.filter((item) => item.id !== id);
      store.comments = store.comments.filter((item) => item.poemId !== id);
      store.likes = store.likes.filter((item) => item.poemId !== id);
      writeStore(store);
    },
    async listComments(poemId) {
      const store = readStore();
      return store.comments
        .filter((comment) => comment.poemId === poemId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map((comment) => ({
          id: comment.id,
          poemId: comment.poemId,
          authorId: comment.authorId,
          authorName: getProfileById(store, comment.authorId)?.displayName ?? "無名",
          body: comment.body,
          createdAt: comment.createdAt,
        }));
    },
    async addComment(poemId, body) {
      const store = readStore();
      const sessionUser = getSessionUser(store);
      if (!sessionUser) {
        throw new Error("コメントにはログインが必要です。");
      }

      const text = body.trim();
      if (text.length < 1 || text.length > 300) {
        throw new Error("コメントは1文字以上300文字以下で入力してください。");
      }

      store.comments.push({
        id: createId("comment"),
        poemId,
        authorId: sessionUser.id,
        body: text,
        createdAt: new Date().toISOString(),
      });
      writeStore(store);
    },
    async toggleLike(poemId) {
      const store = readStore();
      const sessionUser = getSessionUser(store);
      if (!sessionUser) {
        throw new Error("いいねにはログインが必要です。");
      }

      const existing = store.likes.find(
        (like) => like.poemId === poemId && like.userId === sessionUser.id,
      );
      if (existing) {
        store.likes = store.likes.filter(
          (like) =>
            !(like.poemId === poemId && like.userId === sessionUser.id),
        );
        writeStore(store);
        return { liked: false };
      }

      store.likes.push({ poemId, userId: sessionUser.id });
      writeStore(store);
      return { liked: true };
    },
    async requestPasswordReset() {
      throw new Error("デモモードでは利用できません。");
    },
  };
}

async function createFirebaseService() {
  const [
    { initializeApp },
    {
      getAuth,
      onAuthStateChanged,
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      signOut: firebaseSignOut,
      sendPasswordResetEmail,
    },
    {
      getFirestore,
      collection,
      doc,
      getDoc,
      getDocs,
      setDoc,
      addDoc,
      updateDoc,
      deleteDoc,
      query,
      where,
      orderBy,
      limit,
      documentId,
      writeBatch,
    },
  ] = await Promise.all([
    import(FIREBASE_APP_URL),
    import(FIREBASE_AUTH_URL),
    import(FIREBASE_FIRESTORE_URL),
  ]);

  const app = initializeApp(SITE_CONFIG.firebase);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const listeners = new Set();
  let currentUser = null;
  let authReadyResolved = false;
  let resolveAuthReady = null;
  const authReady = new Promise((resolve) => {
    resolveAuthReady = resolve;
  });

  function emitAuth(user) {
    for (const callback of listeners) {
      callback(user);
    }
  }

  function normalizeFirebaseUser(user) {
    return user ? { id: user.uid, email: user.email ?? "" } : null;
  }

  function normalizeProfileDoc(snapshot) {
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return {
      id: snapshot.id,
      displayName: data.displayName,
      bio: data.bio ?? "",
      createdAt: data.createdAt,
    };
  }

  function normalizePoemDoc(snapshot, { profilesById, likesByPoemId, commentsByPoemId }) {
    const data = snapshot.data();
    const likes = likesByPoemId.get(snapshot.id) ?? [];
    const comments = commentsByPoemId.get(snapshot.id) ?? [];
    const authorProfile = profilesById.get(data.authorId);

    return {
      id: snapshot.id,
      authorId: data.authorId,
      authorName: authorProfile?.displayName ?? buildFallbackDisplayName(null),
      title: data.title,
      genre: data.genre,
      tags: data.tags ?? [],
      body: data.body,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      likesCount: likes.length,
      commentCount: comments.length,
      likedByMe: Boolean(currentUser && likes.some((like) => like.userId === currentUser.id)),
      isMine: data.authorId === currentUser?.id,
    };
  }

  async function ensureProfile() {
    await authReady;
    if (!currentUser) {
      return null;
    }

    const profileRef = doc(db, "profiles", currentUser.id);
    let profileSnapshot = await getDoc(profileRef);
    if (!profileSnapshot.exists()) {
      const displayName = buildFallbackDisplayName(currentUser.email);
      await setDoc(profileRef, {
        displayName,
        bio: "",
        createdAt: new Date().toISOString(),
      });
      profileSnapshot = await getDoc(profileRef);
    }

    return normalizeProfileDoc(profileSnapshot);
  }

  async function fetchProfilesByIds(ids) {
    const profileIds = [...new Set(ids.filter(Boolean))];
    if (!profileIds.length) {
      return new Map();
    }

    const snapshots = await Promise.all(
      chunk(profileIds, FIRESTORE_IN_QUERY_LIMIT).map((idChunk) =>
        getDocs(
          query(
            collection(db, "profiles"),
            where(documentId(), "in", idChunk),
          ),
        ),
      ),
    );

    const profilesById = new Map();
    for (const snapshot of snapshots) {
      for (const profileDoc of snapshot.docs) {
        profilesById.set(profileDoc.id, normalizeProfileDoc(profileDoc));
      }
    }

    return profilesById;
  }

  async function fetchDocsByPoemIds(collectionName, poemIds) {
    const ids = [...new Set(poemIds.filter(Boolean))];
    if (!ids.length) {
      return [];
    }

    const snapshots = await Promise.all(
      chunk(ids, FIRESTORE_IN_QUERY_LIMIT).map((idChunk) =>
        getDocs(
          query(
            collection(db, collectionName),
            where("poemId", "in", idChunk),
          ),
        ),
      ),
    );

    return snapshots.flatMap((snapshot) => snapshot.docs);
  }

  function indexDocsByPoemId(documents) {
    const map = new Map();
    for (const snapshot of documents) {
      const data = snapshot.data();
      const current = map.get(data.poemId) ?? [];
      current.push({ id: snapshot.id, ...data });
      map.set(data.poemId, current);
    }
    return map;
  }

  function withFriendlyFirebaseError(error) {
    if (!error?.code) {
      throw error;
    }

    const friendlyMessage = {
      "auth/email-already-in-use": "このメールアドレスはすでに使われています。",
      "auth/invalid-credential": "メールアドレスまたはパスワードが正しくありません。",
      "auth/invalid-email": "メールアドレスの形式が正しくありません。",
      "auth/missing-password": "パスワードを入力してください。",
      "auth/too-many-requests": "試行回数が多すぎます。しばらく待ってから再試行してください。",
      "auth/weak-password": "パスワードは6文字以上にしてください。",
      "permission-denied": "Firebase の権限設定で拒否されました。README の設定手順を確認してください。",
      "failed-precondition": "Firestore のインデックスまたは初期設定が不足しています。README の手順を確認してください。",
      "unavailable": "Firebase に接続できませんでした。通信状況を確認してください。",
    }[error.code];

    if (friendlyMessage) {
      throw new Error(friendlyMessage);
    }

    throw new Error(error.message ?? "Firebase で処理に失敗しました。");
  }

  return {
    mode: "firebase",
    genres: GENRES,
    async initialize() {
      onAuthStateChanged(auth, (user) => {
        currentUser = normalizeFirebaseUser(user);
        if (!authReadyResolved) {
          authReadyResolved = true;
          resolveAuthReady();
        }
        emitAuth(currentUser);
      });

      await authReady;
    },
    subscribeAuth(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async getCurrentUser() {
      await authReady;
      return currentUser;
    },
    async getCurrentProfile() {
      try {
        return await ensureProfile();
      } catch (error) {
        withFriendlyFirebaseError(error);
      }
    },
    async signIn({ mode, email, password, displayName }) {
      const normalizedEmail = String(email ?? "").trim();
      const normalizedPassword = String(password ?? "").trim();
      const normalizedDisplayName = String(displayName ?? "").trim();

      if (!normalizedEmail) {
        throw new Error("メールアドレスを入力してください。");
      }
      if (!normalizedPassword) {
        throw new Error("パスワードを入力してください。");
      }

      try {
        if (mode === "signup") {
          if (!normalizedDisplayName) {
            throw new Error("表示名を入力してください。");
          }
          const credential = await createUserWithEmailAndPassword(
            auth,
            normalizedEmail,
            normalizedPassword,
          );
          await setDoc(doc(db, "profiles", credential.user.uid), {
            displayName: normalizedDisplayName,
            bio: "",
            createdAt: new Date().toISOString(),
          });
          return;
        }

        await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
      } catch (error) {
        withFriendlyFirebaseError(error);
      }
    },
    async signOut() {
      try {
        await firebaseSignOut(auth);
      } catch (error) {
        withFriendlyFirebaseError(error);
      }
    },
    async updateProfile({ displayName, bio = "" }) {
      await authReady;
      if (!currentUser) {
        throw new Error("ログインが必要です。");
      }

      const name = displayName.trim();
      if (!name) {
        throw new Error("表示名を入力してください。");
      }

      try {
        const profileRef = doc(db, "profiles", currentUser.id);
        const snapshot = await getDoc(profileRef);
        const createdAt =
          snapshot.exists() && typeof snapshot.data().createdAt === "string"
            ? snapshot.data().createdAt
            : new Date().toISOString();
        await setDoc(profileRef, {
          displayName: name,
          bio: bio.trim(),
          createdAt,
        });
        return {
          id: currentUser.id,
          displayName: name,
          bio: bio.trim(),
          createdAt,
        };
      } catch (error) {
        withFriendlyFirebaseError(error);
      }
    },
    async listPoems() {
      try {
        await authReady;
        const poemSnapshot = await getDocs(
          query(
            collection(db, "poems"),
            orderBy("createdAt", "desc"),
            limit(SITE_CONFIG.maxPoems),
          ),
        );
        const poemDocs = poemSnapshot.docs;
        const poemIds = poemDocs.map((poemDoc) => poemDoc.id);
        const authorIds = poemDocs.map((poemDoc) => poemDoc.data().authorId);

        const [profilesById, likeDocs, commentDocs] = await Promise.all([
          fetchProfilesByIds(authorIds),
          fetchDocsByPoemIds("likes", poemIds),
          fetchDocsByPoemIds("comments", poemIds),
        ]);

        const likesByPoemId = indexDocsByPoemId(likeDocs);
        const commentsByPoemId = indexDocsByPoemId(commentDocs);

        return poemDocs.map((poemDoc) =>
          normalizePoemDoc(poemDoc, { profilesById, likesByPoemId, commentsByPoemId }),
        );
      } catch (error) {
        withFriendlyFirebaseError(error);
      }
    },
    async getPoem(id) {
      try {
        await authReady;
        const poemRef = doc(db, "poems", id);
        const poemSnapshot = await getDoc(poemRef);
        if (!poemSnapshot.exists()) {
          return null;
        }

        const poemData = poemSnapshot.data();
        const [profilesById, likeDocs, commentDocs] = await Promise.all([
          fetchProfilesByIds([poemData.authorId]),
          fetchDocsByPoemIds("likes", [id]),
          fetchDocsByPoemIds("comments", [id]),
        ]);

        return normalizePoemDoc(poemSnapshot, {
          profilesByPoemId: null,
          profilesById,
          likesByPoemId: indexDocsByPoemId(likeDocs),
          commentsByPoemId: indexDocsByPoemId(commentDocs),
        });
      } catch (error) {
        withFriendlyFirebaseError(error);
      }
    },
    async savePoem({ id = null, title, genre, tags, body }) {
      await authReady;
      if (!currentUser) {
        throw new Error("投稿にはログインが必要です。");
      }

      const payload = normalizePoemInput({ title, genre, tags, body });
      const now = new Date().toISOString();

      try {
        if (id) {
          const poemRef = doc(db, "poems", id);
          const snapshot = await getDoc(poemRef);
          if (!snapshot.exists()) {
            throw new Error("作品が見つかりません。");
          }
          if (snapshot.data().authorId !== currentUser.id) {
            throw new Error("他の人の作品は編集できません。");
          }

          await updateDoc(poemRef, {
            title: payload.title,
            genre: payload.genre,
            tags: payload.tags,
            body: payload.body,
            updatedAt: now,
          });
          return id;
        }

        const created = await addDoc(collection(db, "poems"), {
          authorId: currentUser.id,
          title: payload.title,
          genre: payload.genre,
          tags: payload.tags,
          body: payload.body,
          createdAt: now,
          updatedAt: now,
        });
        return created.id;
      } catch (error) {
        if (error instanceof Error && !("code" in error)) {
          throw error;
        }
        withFriendlyFirebaseError(error);
      }
    },
    async deletePoem(id) {
      await authReady;
      if (!currentUser) {
        throw new Error("ログインが必要です。");
      }

      try {
        const poemRef = doc(db, "poems", id);
        const poemSnapshot = await getDoc(poemRef);
        if (!poemSnapshot.exists()) {
          throw new Error("作品が見つかりません。");
        }
        if (poemSnapshot.data().authorId !== currentUser.id) {
          throw new Error("他の人の作品は削除できません。");
        }

        const [commentSnapshot, likeSnapshot] = await Promise.all([
          getDocs(
            query(
              collection(db, "comments"),
              where("poemId", "==", id),
            ),
          ),
          getDocs(
            query(
              collection(db, "likes"),
              where("poemId", "==", id),
            ),
          ),
        ]);

        const batch = writeBatch(db);
        batch.delete(poemRef);
        for (const commentDoc of commentSnapshot.docs) {
          batch.delete(commentDoc.ref);
        }
        for (const likeDoc of likeSnapshot.docs) {
          batch.delete(likeDoc.ref);
        }
        await batch.commit();
      } catch (error) {
        if (error instanceof Error && !("code" in error)) {
          throw error;
        }
        withFriendlyFirebaseError(error);
      }
    },
    async listComments(poemId) {
      try {
        const commentSnapshot = await getDocs(
          query(
            collection(db, "comments"),
            where("poemId", "==", poemId),
            orderBy("createdAt", "asc"),
          ),
        );
        const comments = commentSnapshot.docs.map((commentDoc) => ({
          id: commentDoc.id,
          ...commentDoc.data(),
        }));
        const profilesById = await fetchProfilesByIds(comments.map((comment) => comment.authorId));

        return comments.map((comment) => ({
          id: comment.id,
          poemId: comment.poemId,
          authorId: comment.authorId,
          authorName: profilesById.get(comment.authorId)?.displayName ?? "無名",
          body: comment.body,
          createdAt: comment.createdAt,
        }));
      } catch (error) {
        withFriendlyFirebaseError(error);
      }
    },
    async addComment(poemId, body) {
      await authReady;
      if (!currentUser) {
        throw new Error("コメントにはログインが必要です。");
      }

      const text = body.trim();
      if (text.length < 1 || text.length > 300) {
        throw new Error("コメントは1文字以上300文字以下で入力してください。");
      }

      try {
        await addDoc(collection(db, "comments"), {
          poemId,
          authorId: currentUser.id,
          body: text,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        withFriendlyFirebaseError(error);
      }
    },
    async toggleLike(poemId) {
      await authReady;
      if (!currentUser) {
        throw new Error("いいねにはログインが必要です。");
      }

      try {
        const likeRef = doc(db, "likes", buildLikeDocId(poemId, currentUser.id));
        const existing = await getDoc(likeRef);
        if (existing.exists()) {
          await deleteDoc(likeRef);
          return { liked: false };
        }

        await setDoc(likeRef, {
          poemId,
          userId: currentUser.id,
          createdAt: new Date().toISOString(),
        });
        return { liked: true };
      } catch (error) {
        withFriendlyFirebaseError(error);
      }
    },
    async requestPasswordReset(email) {
      const target = String(email ?? "").trim();
      if (!target) {
        throw new Error("メールアドレスを入力してください。");
      }

      try {
        await sendPasswordResetEmail(auth, target);
      } catch (error) {
        withFriendlyFirebaseError(error);
      }
    },
  };
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePoemInput({ title, genre, tags, body }) {
  const normalizedTitle = title.trim();
  const normalizedBody = body.trim();
  const normalizedTags = normalizeTags(tags);
  const normalizedGenre = GENRES.includes(genre) ? genre : "その他";

  if (!normalizedTitle || normalizedTitle.length > 80) {
    throw new Error("題名は1文字以上80文字以下で入力してください。");
  }
  if (normalizedBody.length < 10 || normalizedBody.length > 2000) {
    throw new Error("本文は10文字以上2000文字以下で入力してください。");
  }

  return {
    title: normalizedTitle,
    body: normalizedBody,
    genre: normalizedGenre,
    tags: normalizedTags,
  };
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 8);
  }

  return [...new Set(
    String(tags ?? "")
      .split(/[,\n、]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  )].slice(0, 8);
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function buildFallbackDisplayName(email) {
  if (!email) {
    return "無名";
  }

  return email.split("@")[0].slice(0, 30) || "無名";
}

function buildLikeDocId(poemId, userId) {
  return `${poemId}__${userId}`;
}
