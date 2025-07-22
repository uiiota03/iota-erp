// ./js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// Firebase konfiguratsiyasi
const firebaseConfig = {
  apiKey: "AIzaSyDSI8Q9GNSxnwwLms4bKdpPGmP2Sjsi5RU",
  authDomain: "iota-erp.firebaseapp.com",
  projectId: "iota-erp",
  storageBucket: "iota-erp.appspot.com",  // bu yerda `.firebasestorage.app` emas!
  messagingSenderId: "249498348698",
  appId: "1:249498348698:web:4dc1017937dba1159c0323",
  measurementId: "G-RCV3G122BW"
};

// Firebase’ni ishga tushirish
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
