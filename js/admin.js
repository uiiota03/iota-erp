// admin.js
import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    // ❌ Foydalanuvchi login qilmagan – login sahifasiga yubor
    window.location.href = "login.html";
  }
});

// DOM Elements
const form = document.getElementById("addEmployeeForm");
const statusMsg = document.getElementById("addStatus");
const monthSelect = document.getElementById("month-select");
const tabelHeader = document.getElementById("tabel-header");
const tabelBody = document.getElementById("tabel-body");
const employeeTableBody = document.getElementById("employeeTableBody");

// Global
let globalEmployees = [];

/** Format helpers **/
const formatDate = (date) => date.toISOString().slice(0, 10); // YYYY-MM-DD
const formatMonth = (date) => date.toISOString().slice(0, 7); // YYYY-MM

/** Generate month dropdown **/
function generateMonths() {
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = formatMonth(d);
    const option = document.createElement("option");
    option.value = val;
    option.textContent = d.toLocaleString("default", { month: "long", year: "numeric" });
    monthSelect.appendChild(option);
  }
}

/** Load attendance from Firestore **/
async function loadAttendanceData(monthStr) {
  const docRef = doc(db, "attendance", monthStr);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() : {};
}

/** Save updated attendance to Firestore **/
async function saveAttendance(uid, day, status) {
  const monthStr = day.slice(0, 7);
  const docRef = doc(db, "attendance", monthStr);
  const snap = await getDoc(docRef);
  const data = snap.exists() ? snap.data() : {};

  if (!data[uid]) data[uid] = {};
  data[uid][day] = status;

  await setDoc(docRef, data);
}

/** Draw editable attendance table **/
async function drawTabel(monthStr, employees) {
  tabelHeader.innerHTML = `
    <th class="border px-2 py-1">#</th>
    <th class="border px-2 py-1">Ism</th>
    <th class="border px-2 py-1">Familiya</th>
    <th class="border px-2 py-1">Kelgan</th>
    <th class="border px-2 py-1">Kelmagan</th>
  `;
  tabelBody.innerHTML = "";

  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const attendanceData = await loadAttendanceData(monthStr);

  for (let day = 1; day <= daysInMonth; day++) {
    const th = document.createElement("th");
    th.className = "border px-2 py-1 text-xs";
    th.textContent = day;
    tabelHeader.appendChild(th);
  }

  employees.forEach((emp, index) => {
    const tr = document.createElement("tr");

    let present = 0;
    let absent = 0;

    const rowHTML = `
      <td class="border px-2 py-1">${index + 1}</td>
      <td class="border px-2 py-1">${emp.firstName}</td>
      <td class="border px-2 py-1">${emp.lastName}</td>
      <td class="border px-2 py-1 text-green-600 font-bold" id="present-${emp.uid}">0</td>
      <td class="border px-2 py-1 text-red-600 font-bold" id="absent-${emp.uid}">0</td>
    `;
    tr.innerHTML = rowHTML;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
      const cell = document.createElement("td");
      cell.className = "border text-center text-sm px-2 py-1";
      cell.contentEditable = true;
      cell.dataset.uid = emp.uid;
      cell.dataset.day = dateStr;

      const status = attendanceData?.[emp.uid]?.[dateStr] || "";
      cell.textContent = status;

      if (status === "+") present++;
      else if (status === "-") absent++;

      cell.addEventListener("blur", async () => {
        const newStatus = cell.textContent.trim();
        await saveAttendance(emp.uid, dateStr, newStatus);
        drawTabel(monthStr, globalEmployees); // reload
      });

      tr.appendChild(cell);
    }

    tabelBody.appendChild(tr);
    document.getElementById(`present-${emp.uid}`).textContent = present;
    document.getElementById(`absent-${emp.uid}`).textContent = absent;
  });
}

/** Load employee list and call drawTabel **/
async function loadEmployees() {
  const querySnapshot = await getDocs(collection(db, "users"));
  globalEmployees = [];
  employeeTableBody.innerHTML = "";

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.role === "employee") {
      globalEmployees.push({
        uid: data.uid,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        position: data.position,
        startDate: data.startDate
      });

      const row = `
        <tr>
          <td class="px-4 py-2">${globalEmployees.length}</td>
          <td class="px-4 py-2">${data.firstName}</td>
          <td class="px-4 py-2">${data.lastName}</td>
          <td class="px-4 py-2">${data.email}</td>
          <td class="px-4 py-2">${data.position}</td>
          <td class="px-4 py-2">${data.startDate}</td>
        </tr>
      `;
      employeeTableBody.innerHTML += row;
    }
  });

  // render tabel for default selected month
  if (monthSelect.value) {
    drawTabel(monthSelect.value, globalEmployees);
  }
}

/** Add new employee **/
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const firstName = form.firstName.value.trim();
  const lastName = form.lastName.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value.trim();
  const position = form.position.value.trim();
  const startDate = form.startDate.value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      firstName,
      lastName,
      email,
      position,
      startDate,
      role: "employee"
    });

    statusMsg.textContent = "✅ Hodim muvaffaqiyatli qo‘shildi!";
    form.reset();
    loadEmployees();
  } catch (error) {
    statusMsg.textContent = "❌ Xatolik: " + error.message;
  }
});

/** Month change handler **/
monthSelect.addEventListener("change", () => {
  drawTabel(monthSelect.value, globalEmployees);
});

/** Initial load **/
generateMonths();
loadEmployees();
