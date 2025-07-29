// ./js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// Firebase konfiguratsiyasi
const firebaseConfig = {
  apiKey: "AIzaSyAb4y4wwEjaqKpyFFKIZ1QEBlFSmavtwjY",
  authDomain: "iota-erp-12499.firebaseapp.com",
  projectId: "iota-erp-12499",
  storageBucket: "iota-erp-12499.appspot.app",
  messagingSenderId: "494265687137",
  appId: "1:494265687137:web:923f2b07bf4ab2e316de20",
  measurementId: "G-MJN1YLGM7M"
};

// Firebase’ni ishga tushirish
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
