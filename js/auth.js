// js/auth.js
import {
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

// Login formini eshitamiz
const form = document.getElementById("loginForm");
const errorMsg = document.getElementById("errorMsg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = form.email.value.trim();
  const password = form.password.value.trim();
  errorMsg.textContent = "";

  try {
    // Firebase Auth orqali kirish
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Firestore'dan foydalanuvchi ma'lumotlarini olish
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      errorMsg.textContent = "Foydalanuvchi ma'lumotlari topilmadi.";
      return;
    }

    const userData = userSnap.data();

    // Ma'lumotlarni localStorage'ga saqlash
    localStorage.setItem("userData", JSON.stringify(userData));

    // Rolga qarab sahifaga yo'naltirish
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
    console.error("Kirishda xatolik:", error);
    errorMsg.textContent = "Email yoki parol noto‘g‘ri!";
  }
});
