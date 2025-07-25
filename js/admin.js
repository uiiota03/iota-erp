// admin.js
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
  }
});

const form = document.getElementById("addEmployeeForm");
const statusMsg = document.getElementById("addStatus");
const monthSelect = document.getElementById("month-select");
const tabelHeader = document.getElementById("tabel-header");
const tabelBody = document.getElementById("tabel-body");

let globalEmployees = [];


function formatDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTodayString() {
  const today = new Date();
  return today.toISOString().split("T")[0]; // "2025-07-22"
}

const formatMonth = (date) => date.toISOString().slice(0, 7);

function generateMonths() {
  const now = new Date();
  for (let i = -1; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, -1);
    const val = formatMonth(d);
    const option = document.createElement("option");
    option.value = val;
    option.textContent = d.toLocaleString("default", { month: "long", year: "numeric" });

    // ✅ Hozirgi oy default tanlanadi
    if (i === -1) option.selected = true;

    monthSelect.appendChild(option);
  }
}


async function loadAttendanceData(monthStr) {
  if (!monthStr) {
    const now = new Date();
    monthStr = now.toISOString().slice(0, 7); // "2025-07"
  }

  const docRef = doc(db, "attendance", monthStr);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return {};
  return docSnap.data();
}

async function testLoad() {
  const data = await loadAttendanceData("2025-07");
  console.log("✅ Attendance Data:", data);
}

testLoad()

async function saveAttendance(uid, day, status) {
  const monthStr = day.slice(0, 7);
  const docRef = doc(db, "attendance", monthStr);
  const snap = await getDoc(docRef);
  const data = snap.exists() ? snap.data() : {};

  if (!data[uid]) data[uid] = {};
  data[uid][day] = status;

  await setDoc(docRef, data);
}

async function drawTabel(monthStr, employees) {
  tabelHeader.innerHTML = `
    <th class="border border-gray-300 bg-white px-2 py-1">#</th>
    <th class="border border-gray-300 bg-white px-2 py-1">Ism</th>
    <th class="border border-gray-300 bg-white px-2 py-1">Familiya</th>
    <th class="border border-gray-300 bg-white px-2 py-1 text-green-700">Kelgan</th>
    <th class="border border-gray-300 bg-white px-2 py-1 text-red-600">Kelmagan</th>
    <th class="border border-gray-300 bg-white px-2 py-1">Vaqt</th>
  `;

  tabelBody.innerHTML = "";

  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const attendanceData = await loadAttendanceData(monthStr);
  const todayStr = formatDate(new Date());
  const today = new Date();

  // === Header kunlar ===
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isToday = formatDate(date) === todayStr;

    const th = document.createElement("th");
    th.className = "border border-gray-300 px-2 py-1 text-xs text-center";
    if (isToday) {
      th.classList.add("bg-blue-100", "text-blue-800", "font-semibold");
    } else if (isWeekend) {
      th.classList.add("bg-gray-100", "text-gray-600");
    } else {
      th.classList.add("bg-white");
    }

    th.innerHTML = `${day}<br><span class="text-gray-400 text-[10px]">${["Yak", "Du", "Se", "Ch", "Pa", "Ju", "Sh"][date.getDay()]}</span>`;
    tabelHeader.appendChild(th);
  }

  employees.forEach((emp, index) => {
    const tr = document.createElement("tr");
    let present = 0;
    let absent = 0;

    const lastEntry = attendanceData?.[emp.uid]?.[todayStr] || "";
    const checkinTime = getCheckinTime(lastEntry);

    tr.innerHTML = `
      <td class="border border-gray-300 px-2 py-1">${index + 1}</td>
      <td class="border border-gray-300 px-2 py-1">${emp.firstName}</td>
      <td class="border border-gray-300 px-2 py-1">${emp.lastName}</td>
      <td class="border border-gray-300 px-2 py-1 text-green-600 font-bold" id="present-${emp.uid}">0</td>
      <td class="border border-gray-300 px-2 py-1 text-red-600 font-bold" id="absent-${emp.uid}">0</td>
      <td class="border border-gray-300 px-2 py-1 text-xs text-gray-500">${checkinTime}</td>
    `;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
      const cellDate = new Date(year, month - 1, day);
      const isFuture = cellDate > today;
      const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
      const isToday = formatDate(cellDate) === todayStr;

      const cell = document.createElement("td");
      cell.className = "border border-gray-300 px-2 py-1 text-center text-sm";
      cell.contentEditable = true;
      cell.dataset.uid = emp.uid;
      cell.dataset.day = dateStr;

      let status = attendanceData?.[emp.uid]?.[dateStr] || "";
      if (status.includes("@")) status = status.split("@")[0];
      cell.textContent = status;

      // Ranglar
      if (isFuture) {
        cell.classList.add("bg-slate-100", "text-slate-400");
      } else if (status === "+") {
        cell.classList.add("bg-green-50", "text-green-700", "font-medium");
        present++;
      } else if (status === "-") {
        cell.classList.add("bg-red-50", "text-red-600", "font-medium");
        absent++;
      } else if (isToday) {
        cell.classList.add("bg-blue-50", "text-blue-600");
      } else if (isWeekend) {
        cell.classList.add("bg-gray-100", "text-gray-500");
      } else {
        cell.classList.add("bg-white", "text-gray-400");
      }

      // Save + refresh
      cell.addEventListener("blur", async () => {
        const newStatus = cell.textContent.trim();
        let valueToSave = newStatus;

        if (newStatus === "+") {
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          valueToSave = `+@${timeStr}`;
        }

        await saveAttendance(emp.uid, dateStr, valueToSave);
        if (newStatus === "+") checkLateTime(dateStr, emp.firstName);
        drawTabel(monthStr, employees);
      });

      tr.appendChild(cell);
    }

    tabelBody.appendChild(tr);
    document.getElementById(`present-${emp.uid}`).textContent = present;
    document.getElementById(`absent-${emp.uid}`).textContent = absent;
  });
}

function getCheckinTime(entry = "") {
  if (typeof entry === "string" && entry.includes("@")) {
    return entry.split("@")[1] || "-";
  }
  return "-";
}

function checkLateTime(dateStr, name) {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  if (hour > 8 || (hour === 8 && minute > 10)) {
    alert(`⚠️ ${name} ${dateStr} kuni 08:10 dan kech keldi!`);
  }
}

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

monthSelect.addEventListener("change", () => {
  drawTabel(monthSelect.value, globalEmployees);
});

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
  } else {
    const today = new Date();
    const defaultMonth = formatMonth(today); // fallback
    drawTabel(defaultMonth, globalEmployees);
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

// Barcha xodimlarga absent qo‘yish (admin uchun)
export async function bulkAutoMarkAbsent() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  if (hour < 8 || (hour === 8 && minute <= 10)) {
    console.log("⏳ 08:10 dan oldin, hali absent belgilanmaydi.");
    return;
  }

  const today = getTodayString();
  const monthStr = today.slice(0, 7);
  const docRef = doc(db, "attendance", monthStr);
  const snap = await getDoc(docRef);
  const attendanceData = snap.exists() ? snap.data() : {};

  const usersSnapshot = await getDocs(collection(db, "users"));
  let updated = false;

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;
    const userDays = attendanceData[uid] || {};

    // ✅ Allaqachon check-in qilingan yoki absent belgilanganmi?
    if (userDays[today]) continue;

    userDays[today] = "-";
    attendanceData[uid] = userDays;
    updated = true;
    console.warn(`❌ ${uid} absent belgilandi.`);
  }

  if (updated) {
    await setDoc(docRef, attendanceData, { merge: true });
    console.log("✅ Absentlar yangilandi.");
  } else {
    console.log("✅ Hamma xodimlar check-in qilgan yoki allaqachon absent belgilangan.");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const todayMonth = new Date().toISOString().slice(0, 7); // "2025-07"
  bulkAutoMarkAbsent();
  loadAttendanceData(todayMonth); // ✅ bu yerda aniq qiymat
});

document.addEventListener("DOMContentLoaded", () => {
  const navEmployees = document.getElementById("navEmployees");
  const navAttendance = document.getElementById("navAttendance");
  const navVacations = document.getElementById("navVacations");

  const employeesSection = document.getElementById("employeesSection");
  const attendanceSection = document.getElementById("attendanceSection");
  const vacationRequestsSection = document.getElementById("vacationRequestsSection");

  function showSection(section) {
    employeesSection.classList.add("hidden");
    attendanceSection.classList.add("hidden");
    vacationRequestsSection.classList.add("hidden");

    section.classList.remove("hidden");
  }

  navEmployees.addEventListener("click", () => showSection(employeesSection));
  navAttendance.addEventListener("click", () => showSection(attendanceSection));
  navVacations.addEventListener("click", () => showSection(vacationRequestsSection));
});

// admin.js

// Modal elementlar
const vacationModal = document.getElementById("vacationModal");
const vacationModalContent = document.getElementById("vacationModalContent");
const vacationRequestsTableBody = document.getElementById("vacationRequestsTableBody");

async function loadVacationRequests() {
  const querySnapshot = await getDocs(collection(db, "vacationRequests"));
  vacationRequestsTableBody.innerHTML = ""; // tozalash

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="border px-4 py-2">${data.fullName}</td>
      <td class="border px-4 py-2">${data.position}</td>
      <td class="border px-4 py-2">${data.purpose}</td>
      <td class="border px-4 py-2">${data.createdAt?.toDate().toLocaleDateString() || "-"}</td>
      <td class="border px-4 py-2">${data.status || "Pending"}</td>
      <td class="border px-4 py-2">
        <button class="bg-blue-500 text-white px-2 py-1 rounded view-request" data-id="${docSnap.id}">View</button>
      </td>
    `;
    vacationRequestsTableBody.appendChild(tr);
  });

  // Har bir view tugmasiga listener ulash
  document.querySelectorAll('.view-request').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      const docRef = doc(db, "vacationRequests", id);
      const docSnap = await getDoc(docRef);
      const data = docSnap.data();

      vacationModalContent.innerHTML = `
        <h3 class="text-lg font-semibold mb-2">Vacation Request</h3>
        <p><strong>Name:</strong> ${data.fullName}</p>
        <p><strong>Position:</strong> ${data.position}</p>
        <p><strong>Title:</strong>Vacation</p>
        <p><strong>Purpose:</strong> ${data.purpose}</p>
        <p><strong>From:</strong> ${data.startDate}</p>
        <p><strong>To:</strong> ${data.endDate}</p>
        <p><strong>Status:</strong> ${data.status || "Pending"}</p>
        <div class="flex justify-end space-x-2 mt-4">
          <button class="bg-green-500 text-white px-4 py-2 rounded" onclick="handleVacationAction('${id}', 'Approved')">Approve</button>
          <button class="bg-red-500 text-white px-4 py-2 rounded" onclick="handleVacationAction('${id}', 'Rejected')">Reject</button>
          <button class="text-gray-600" onclick="vacationModal.classList.add('hidden')">Close</button>
        </div>
      `;
      vacationModal.classList.remove("hidden");
    });
  });
}

window.handleVacationAction = async function (id, status) {
  const ref = doc(db, "vacationRequests", id);
  await updateDoc(ref, { status });
  vacationModal.classList.add('hidden');
  loadVacationRequests(); // reload list
};

// Panelni nav orqali boshqarish (vacation panel ko‘rsatish)
document.getElementById("navVacations").addEventListener("click", () => {
  document.getElementById("employeesSection").classList.add("hidden");
  document.getElementById("attendanceSection").classList.add("hidden");
  document.getElementById("vacationRequestsSection").classList.remove("hidden");
  loadVacationRequests();
});

document.addEventListener("DOMContentLoaded", () => {
  const openModalBtn = document.getElementById("openAddEmployeeModal");
  const modal = document.getElementById("addEmployeeModal");

  if (openModalBtn && modal) {
    openModalBtn.addEventListener("click", () => {
      modal.classList.remove("hidden");
    });
  }
});



/** Initial load **/
generateMonths();
loadEmployees();
