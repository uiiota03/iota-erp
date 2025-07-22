import {
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

import {
  getDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

const form = document.getElementById("loginForm");
const errorMsg = document.getElementById("errorMsg");

// 🔒 Birinchi login bo'lgan employee UID
const lockedEmployeeUID = localStorage.getItem("lockedEmployee");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = form.email.value.trim();
  const password = form.password.value.trim();
  errorMsg.textContent = "";

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      errorMsg.textContent = "Foydalanuvchi topilmadi.";
      return;
    }

    const userData = userSnap.data();

    // 🔒 Agar employee bo‘lsa va locked UID boshqa foydalanuvchiga tegishli bo‘lsa — ruxsat berilmaydi
    if (
      userData.role === "employee" &&
      lockedEmployeeUID &&
      lockedEmployeeUID !== user.uid
    ) {
      errorMsg.textContent = "Bu qurilmada boshqa hodim bilan kira olmaysiz.";
      return;
    }

    // 🔒 Agar employee va birinchi marta login qilsa — UID ni saqlaymiz
    if (userData.role === "employee" && !lockedEmployeeUID) {
      localStorage.setItem("lockedEmployee", user.uid);
    }

    // 👤 Foydalanuvchini localStorage'ga saqlaymiz
    localStorage.setItem("userData", JSON.stringify(userData));

    // 🔁 Roli bo‘yicha yo‘naltiramiz
    switch (userData.role) {
      case "admin":
        window.location.href = "/admin.html";
        break;
      case "employee":
        window.location.href = "/employee.html";
        break;
      default:
        errorMsg.textContent = "Noma'lum foydalanuvchi roli.";
        break;
    }

  } catch (error) {
    console.error("Login xatosi:", error);
    errorMsg.textContent = "Email yoki parol noto‘g‘ri.";
  }
});
