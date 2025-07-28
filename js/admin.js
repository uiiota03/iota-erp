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
  updateDoc,
  query,
  where
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

document.addEventListener("DOMContentLoaded", async () => {
  const monthSelect = document.getElementById("month-select");

  if (!monthSelect) {
    console.error("❌ monthSelect elementi topilmadi!");
    return;
  }

  // 1. Oylar ro'yxatini generate qilamiz
  generateMonths();

  // 2. Ishchilarni yuklaymiz va globalga saqlaymiz
  globalEmployees = await loadEmployees();

  // 3. Hozirgi oy bo'yicha jadvalni chizamiz
  const selectedMonth = monthSelect.value || formatMonth(new Date());
  await drawTabel(selectedMonth, globalEmployees);

  // 4. Oy tanlanganda qayta chizamiz
  monthSelect.addEventListener("change", () => {
    const selected = monthSelect.value;
    drawTabel(selected, globalEmployees);
  });
});


// Util function: calculate difference between 2 dates in days
function getDaysDiff(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = endDate.getTime() - startDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

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
function getMonthString(date) {
  return date.toISOString().slice(0, 7);
}
function generateMonths() {
  const now = new Date();
  const currentYear = now.getFullYear();
  for (let i = 1; i < 13; i++) {
    const d = new Date(currentYear, i, 0);
    const val = formatMonth(d);
    const option = document.createElement("option");
    option.value = val;
    option.textContent = d.toLocaleString("default", { month: "long", year: "numeric" });

    // ✅ Hozirgi oy default tanlanadi
    if (val === getMonthString(now)) option.selected = true;

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
  const vacationData = await loadApprovedVacations();
  const userVacations = vacationData?.[employees.uid] || [];
  const today = new Date();
  const todayStr = formatDate(today);

  // === Header kunlar ===
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isToday = formatDate(date) === todayStr;

    const th = document.createElement("th");
    th.className = "border border-gray-300 px-2 py-1 text-xs text-center";
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
      cell.id = `day-${dateStr}`;
      cell.dataset.uid = emp.uid;
      cell.dataset.day = dateStr;

      // 1. Attendance status
      let status = attendanceData?.[emp.uid]?.[dateStr] || "";
      if (status.includes("@")) status = status.split("@")[0];

      // 1. Vacation check
      const userVacations = vacationData[emp.uid] || [];
      const isOnVacation = userVacations.some(vac => dateStr >= vac.from && dateStr <= vac.to);
      console.log("userVacations :", userVacations);
      console.log("isOnVacation :", isOnVacation);

      // 2. Determine display status
      if (!status && isOnVacation) {
        status = "V";
      }

      cell.textContent = status;

      if (status === "V") {
        cell.classList.add("bg-yellow-50", "text-yellow-600", "font-medium");
      } else if (status === "+") {
        cell.classList.add("bg-green-50", "text-green-700", "font-medium");
        present++;
      } else if (status === "-") {
        cell.classList.add("bg-red-50", "text-red-600", "font-medium");
        absent++;
      } else if (isWeekend) {
        cell.classList.add("bg-gray-100", "text-gray-500");
      } else if (isToday) {
        cell.classList.add("bg-blue-50", "text-blue-600");
      } else if (isFuture) {
        cell.classList.add("bg-slate-100", "text-slate-400");
      } else {
        cell.classList.add("bg-white", "text-gray-400");
      }

      // Save handler
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

    // === Working hours calculation ===
    let totalMinutesWorked = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
      const rawStatus = attendanceData?.[emp.uid]?.[dateStr] || "";
      if (rawStatus.startsWith("+@")) {
        const timeStr = rawStatus.split("@")[1];
        let [hour, min] = timeStr.split(":").map(Number);
        let checkIn = new Date(year, month - 1, day, hour, min);
        const endOfDay = new Date(year, month - 1, day, 17, 0);

        // Agar 8:10 dan oldin bo‘lsa → 8:00 hisoblanadi
        const eightTen = new Date(year, month - 1, day, 8, 10);
        if (checkIn <= eightTen) {
          totalMinutesWorked += 8 * 60;
        } else {
          const diff = Math.max(0, (endOfDay - checkIn) / 60000); // in minutes
          totalMinutesWorked += diff;
        }
      }
    }

    const workedHours = Math.floor(totalMinutesWorked / 60);
    const workedMinutes = totalMinutesWorked % 60;

    const timeTd = tr.querySelector("td:nth-child(6)");
    timeTd.textContent = `${workedHours} soat ${workedMinutes} daqiqa`;

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

/** Load employee list and call drawTabel **/
async function loadEmployees() {
  const employeeTableBody = document.getElementById("employeeTableBody");
  employeeTableBody.innerHTML = "";

  const usersSnapshot = await getDocs(collection(db, "users"));
  let index = 1;
  const employees = [];

  for (const userDoc of usersSnapshot.docs) {
    const data = userDoc.data();
    const {
      firstName,
      lastName,
      email,
      position,
      startDate,
      vacationLeft
    } = data;

    // Push to array for drawTabel
    employees.push({
      uid: userDoc.id, // UID from doc ID
      firstName,
      lastName,
      email,
      position,
      startDate,
      vacationLeft
    });

    // Display in employee table
    const workDuration = calculateWorkDuration(startDate);

    const row = `
  <tr>
    <td class="border px-4 py-2">${index++}</td>
    <td class="border px-4 py-2">${firstName}</td>
    <td class="border px-4 py-2">${lastName}</td>
    <td class="border px-4 py-2">${email}</td>
    <td class="border px-4 py-2">${position}</td>
    <td class="border px-4 py-2">${startDate}</td>
    <td class="border px-4 py-2">${workDuration}</td>
    <td class="border px-4 py-2 text-green-600 font-semibold">${vacationLeft} days</td>
  </tr>
`;

    employeeTableBody.insertAdjacentHTML("beforeend", row);
  }

  return employees; // ✅ employees ro'yxatini qaytaramiz
}

function calculateWorkDuration(startDateStr) {
  const startDate = new Date(startDateStr);
  const today = new Date();

  let totalMonths = (today.getFullYear() - startDate.getFullYear()) * 12;
  totalMonths += today.getMonth() - startDate.getMonth();

  if (today.getDate() < startDate.getDate()) {
    totalMonths--;
  }

  totalMonths = Math.max(0, totalMonths);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years > 0 && months > 0) {
    return `${years} yil ${months} oy`;
  } else if (years > 0) {
    return `${years} yil`;
  } else {
    return `${months} oy`;
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
      role: "employee",
      vacationLeft: 21
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
    <button class="bg-green-500 text-white px-4 py-2 rounded" onclick='handleVacationAction("${id}", "Approved", ${JSON.stringify(data)})'>Approve</button>
    <button class="bg-red-500 text-white px-4 py-2 rounded" onclick='handleVacationAction("${id}", "Rejected", ${JSON.stringify(data)})'>Reject</button>
    <button class="text-gray-600" onclick="vacationModal.classList.add('hidden')">Close</button>
  </div>
      `;
      vacationModal.classList.remove("hidden");
    });
  });
}

async function handleVacationAction(vacationId, action) {
  const vacationRef = doc(db, "vacationRequests", vacationId);

  try {
    // 1. Vacation status yangilash
    await updateDoc(vacationRef, { status: action });

    const vacationSnap = await getDoc(vacationRef);
    const vacationData = vacationSnap.data();

    console.log("Vacation ID:", vacationId);
    console.log("Vacation Data:", vacationData);

    const uid = vacationData.uid;

    if (action === "Approved") {
      const start = new Date(vacationData.startDate);
      const end = new Date(vacationData.endDate);

      // Sanalar orasidagi kunlar soni (to'liq kiritilgan kunlar ham qo‘shiladi)
      const timeDiff = end.getTime() - start.getTime();
      const dayCount = Math.floor(timeDiff / (1000 * 3600 * 24)) + 1;

      // Faqat users dan olish kerak: real-time yangilanishi uchun
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        console.error("User not found for UID:", uid);
        return;
      }

      const userData = userSnap.data();
      const currentVacationLeft = userData.vacationLeft ?? 0;

      // ❗ YANGILIK: 21 - 5 = 16 emas, 21 - 21 = 0 bo‘lyapti — sababi noto‘g‘ri manbadan olingan
      const updatedLeft = Math.max(0, currentVacationLeft - dayCount);

      await updateDoc(userRef, {
        vacationLeft: updatedLeft
      });

      console.log(`✅ VacationLeft updated for ${vacationData.fullName}: ${updatedLeft}`);
    }

    loadEmployees();
    loadVacationRequests();

    // Modalni yopish
    const modal = document.getElementById("vacationModal");
    if (modal) {
      modal.classList.add("hidden");
    }

  } catch (error) {
    console.error("❌ Error handling vacation action:", error);
  }
}
window.handleVacationAction = handleVacationAction;

// Panelni nav orqali boshqarish (vacation panel ko‘rsatish)
document.getElementById("navVacations").addEventListener("click", () => {
  document.getElementById("employeesSection").classList.add("hidden");
  document.getElementById("attendanceSection").classList.add("hidden");
  document.getElementById("vacationRequestsSection").classList.remove("hidden");
  loadVacationRequests();
});

async function loadApprovedVacations() {
  const q = query(collection(db, "vacationRequests"), where("status", "==", "Approved"));
  const snapshot = await getDocs(q);
  const vacationsByUser = {};

  snapshot.forEach(doc => {
    const data = doc.data();
    const uid = data.uid;
    const from = data.startDate;
    const to = data.endDate;

    if (!vacationsByUser[uid]) {
      vacationsByUser[uid] = [];
    }

    vacationsByUser[uid].push({ from, to });
  });

  return vacationsByUser;
}

document.addEventListener("DOMContentLoaded", () => {
  const openModalBtn = document.getElementById("openAddEmployeeModal");
  const modal = document.getElementById("addEmployeeModal");

  if (openModalBtn && modal) {
    openModalBtn.addEventListener("click", () => {
      modal.classList.remove("hidden");
    });
  }
});
