export const SITE_CONFIG = {
  siteName: "余白に詩を",
  siteTagline: "言葉を置いて、誰かの余白に届かせるための詩のコミュニティ",
  firebase: {
    apiKey: "AIzaSyAzG6W6S96u6UxC1C1wzW-Eocy0jRZOesE",
    authDomain: "kmc-jpn1-poem-community.firebaseapp.com",
    projectId: "kmc-jpn1-poem-community",
    appId: "1:661233014570:web:e3a9d2530b03a1876f3053",
    storageBucket: "kmc-jpn1-poem-community.firebasestorage.app",
    messagingSenderId: "661233014570",
  },
  enableComments: true,
  maxPoems: 100,
};

export function isFirebaseConfigured() {
  return Boolean(
    SITE_CONFIG.firebase.apiKey.trim() &&
      SITE_CONFIG.firebase.authDomain.trim() &&
      SITE_CONFIG.firebase.projectId.trim() &&
      SITE_CONFIG.firebase.appId.trim(),
  );
}
