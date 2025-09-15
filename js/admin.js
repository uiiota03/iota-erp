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
  where,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { exportAttendanceToExcel } from "./exportExcel.js";
import { exportAttendanceToHTML } from './exportAttendence.js';

// Export buttons
document.getElementById("exportExcelBtn").addEventListener("click", async () => {
  const monthStr = document.getElementById("month-select").value;
  const employees = globalEmployees;
  const attendanceDocSnap = await getDoc(doc(db, "attendance", monthStr));
  const attendanceData = attendanceDocSnap.exists() ? attendanceDocSnap.data() : {};
  exportAttendanceToExcel(monthStr, employees, attendanceData);
});

document.getElementById("exportWebBtn").addEventListener("click", async () => {
  const monthStr = document.getElementById("month-select").value;
  const employees = globalEmployees;
  const attendanceDocSnap = await getDoc(doc(db, "attendance", monthStr));
  const attendanceData = attendanceDocSnap.exists() ? attendanceDocSnap.data() : {};
  exportAttendanceToHTML(monthStr, employees, attendanceData);
});

// Auth check
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
  if (!monthSelect) {
    console.error("❌ monthSelect elementi topilmadi!");
    return;
  }

  generateMonths();
  globalEmployees = await loadEmployees();
  const selectedMonth = monthSelect.value || formatMonth(new Date());
  await drawTabel(selectedMonth, globalEmployees);

  monthSelect.addEventListener("change", () => {
    const selected = monthSelect.value;
    drawTabel(selected, globalEmployees);
  });
});

function formatDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTodayString() {
  const today = new Date();
  return today.toISOString().split("T")[0];
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
    if (val === getMonthString(now)) option.selected = true;
    monthSelect.appendChild(option);
  }
}

async function loadAttendanceData(monthStr) {
  if (!monthStr) {
    const now = new Date();
    monthStr = now.toISOString().slice(0, 7);
  }
  const docRef = doc(db, "attendance", monthStr);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : {};
}

async function saveAttendance(uid, day, status) {
  const monthStr = day.slice(0, 7);
  const docRef = doc(db, "attendance", monthStr);
  const snap = await getDoc(docRef);
  const data = snap.exists() ? snap.data() : {};

  if (!data[uid]) data[uid] = {};
  if (status) {
    data[uid][day] = status;
  } else {
    delete data[uid][day];
  }
  await setDoc(docRef, data);
}

async function drawTabel(monthStr, employees) {
  employees = employees.filter(emp => {
    const role = (emp.position || "").toLowerCase();
    return role !== "it specialist";
  });

  // Tartiblash: avval lavozim, keyin oddiy > shiftli
  employees.sort((a, b) => {
    const getPriority = (position) => {
      if (!position || position.trim() === "") return 0;
      if (position.toLowerCase() === "master") return 1;
      if (position.toLowerCase() === "specialist") return 2;
      return 0;
    };
    const priorityA = getPriority(a.position);
    const priorityB = getPriority(b.position);
    if (priorityA !== priorityB) return priorityA - priorityB;

    const shiftA = a.shiftType ? 1 : 0;
    const shiftB = b.shiftType ? 1 : 0;
    return shiftA - shiftB;
  });

  tabelHeader.innerHTML = `
    <th class="border border-gray-300 bg-white px-2 py-1">T/r</th>
    <th class="border border-gray-300 bg-white px-2 py-1">Ism</th>
    <th class="border border-gray-300 bg-white px-2 py-1">Familiya</th>
    <th class="border border-gray-300 bg-white px-2 py-1">Shift Type</th>
    <th class="border border-gray-300 bg-white px-2 py-1 text-green-600">Kelgan</th>
    <th class="border border-gray-300 bg-white px-2 py-1 text-red-600">Kelmagan</th>
    <th class="border border-gray-300 bg-white px-2 py-1">Vaqt</th>
  `;

  tabelBody.innerHTML = "";

  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const attendanceData = await loadAttendanceData(monthStr);
  const vacationData = await loadApprovedVacations();
  const today = new Date();
  const todayStr = formatDate(today);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isToday = formatDate(date) === todayStr;

    const th = document.createElement("th");
    th.className = "border border-gray-300 px-2 py-1 text-xs text-center";
    th.innerHTML = `${day}<br><span class="text-gray-400 text-[10px]">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][date.getDay()]}</span>`;
    tabelHeader.appendChild(th);
  }

  employees.forEach((emp, index) => {
    const tr = document.createElement("tr");
    let present = 0;
    let absent = 0;

    const lastEntry = attendanceData?.[emp.uid]?.[todayStr] || "";
    const checkinTime = getCheckinTime(lastEntry);

    const shiftTypeDisplay = emp.shiftType ? "Shiftli" : "Oddiy";

    tr.innerHTML = `
      <td class="border border-gray-300 px-2 py-1">${index + 1}</td>
      <td class="border border-gray-300 px-2 py-1">${emp.firstName}</td>
      <td class="border border-gray-300 px-2 py-1">${emp.lastName}</td>
      <td class="border border-gray-300 px-2 py-1">${shiftTypeDisplay}</td>
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

      let isRestDay = false;
      let expectedShift = null;
      if (emp.shiftType === "shift") {
        const startDate = new Date(emp.startDate);
        const daysSinceHire = Math.floor((cellDate - startDate) / (1000 * 60 * 60 * 24));
        const cyclePosition = daysSinceHire % 4;
        isRestDay = cyclePosition >= 2;
        if (!isRestDay) {
          expectedShift = cyclePosition === 0 ? "day" : "night";
        }
      }

      const cell = document.createElement("td");
      cell.className = "border border-gray-300 px-2 py-1 text-center text-sm";
      cell.contentEditable = !isFuture;
      cell.id = `day-${dateStr}`;
      cell.dataset.uid = emp.uid;
      cell.dataset.day = dateStr;

      let status = attendanceData?.[emp.uid]?.[dateStr] || "";
      let displayStatus = status;
      if (status.includes("@")) {
        displayStatus = status.startsWith("O") || status.startsWith("E") ? "+" : status.split("@")[0];
      }

      const userVacations = vacationData?.[emp.uid] || [];
      const isOnVacation = userVacations.some(vac => dateStr >= vac.from && dateStr <= vac.to);

      if (!status && isOnVacation) {
        displayStatus = "V";
        status = "V";
      } else if (!status && !isOnVacation && !isWeekend && !isFuture && !isRestDay) {
        absent++;
      }

      cell.textContent = displayStatus;

      // Rang belgilash
      let currentShift = null;
      if (emp.shiftType === "shift" && (status.startsWith("+@") || status.startsWith("O@") || status.startsWith("E@"))) {
        const timeStr = status.split("@")[1];
        const [hour] = timeStr.split(":").map(Number);
        currentShift = (hour >= 8 && hour < 20) ? "day" : "night";
      } else if (emp.shiftType === "shift" && (status === "D" || status === "N")) {
        currentShift = status === "D" ? "day" : "night";
      }

      if (status === "V") {
        cell.classList.add("bg-yellow-50", "text-yellow-600", "font-medium");
      } else if (status.startsWith("+") || status.startsWith("O") || status.startsWith("E") || status === "D" || status === "N") {
        cell.classList.add(
          status.startsWith("O") ? "bg-blue-100" : status.startsWith("E") ? "bg-orange-100" : currentShift === "day" ? "bg-green-100" : currentShift === "night" ? "bg-blue-200" : "bg-green-50",
          status.startsWith("O") ? "text-blue-700" : status.startsWith("E") ? "text-orange-700" : currentShift === "day" ? "text-green-700" : currentShift === "night" ? "text-blue-700" : "text-green-700",
          "font-medium"
        );
        present++;
      } else if (status.startsWith("-")) {
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

      cell.addEventListener("blur", async () => {
        if (isFuture) return;
        let newStatus = cell.textContent.trim();
        let valueToSave = newStatus;

        if (newStatus === "+" || newStatus === "O") {
          const now = new Date();
          const hours = now.getHours();
          const minutes = now.getMinutes();
          const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

          let currentShiftFromTime = (hours >= 8 && hours < 20) ? "day" : "night";

          if (emp.shiftType === "shift") {
            if (currentShiftFromTime !== expectedShift) {
              alert(`⚠️ Bu vaqt bugungi shiftga (${expectedShift}) mos emas!`);
              cell.textContent = "";
              return;
            }
          } else if (hours < 8 || hours >= 17) {
            alert("⚠️ Oddiy smena: Faqat 08:00-17:00 oralig‘ida check-in mumkin!");
            cell.textContent = "";
            return;
          }

          if (newStatus === "O") {
            const overtimeHours = prompt("Overtime soatlarini kiriting (masalan, 2):", "0") || "0";
            valueToSave = `O@${timeStr}@${overtimeHours}`;
          } else {
            valueToSave = `+@${timeStr}`;
          }
        } else if (newStatus === "E") {
          const leaveTime = prompt("Chiqish vaqtini kiriting (HH:MM, masalan, 15:00):", "17:00") || "17:00";
          valueToSave = `E@${leaveTime}`;
        } else if (newStatus === "-") {
          valueToSave = "-";
        } else if (newStatus === "D" || newStatus === "N") {
          if (emp.shiftType !== "shift") {
            alert("⚠️ D yoki N faqat shiftli hodimlar uchun!");
            cell.textContent = "";
            return;
          }
          valueToSave = newStatus;
        } else if (newStatus === "") {
          valueToSave = "";
        } else {
          alert("⚠️ Noto'g'ri belgi! Faqat +, O, E, -, D, N yoki bo'sh mumkin.");
          cell.textContent = "";
          return;
        }

        await saveAttendance(emp.uid, dateStr, valueToSave);
        if (newStatus === "+") checkLateTime(dateStr, emp.firstName, emp.shiftType, expectedShift, now.getHours(), now.getMinutes());
        drawTabel(monthStr, employees);
      });

      tr.appendChild(cell);
    }

    let totalMinutesWorked = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
      const rawStatus = attendanceData?.[emp.uid]?.[dateStr] || "";
      const cellDate = new Date(year, month - 1, day);

      let isRestDay = false;
      if (emp.shiftType === "shift") {
        const startDate = new Date(emp.startDate);
        const daysSinceHire = Math.floor((cellDate - startDate) / (1000 * 60 * 60 * 24));
        const cyclePosition = daysSinceHire % 4;
        isRestDay = cyclePosition >= 2;
      }

      let currentShift = null;
      if (emp.shiftType === "shift" && rawStatus.includes("@")) {
        const timeStr = rawStatus.split("@")[1];
        const [hour] = timeStr.split(":").map(Number);
        currentShift = (hour >= 8 && hour < 20) ? "day" : "night";
      } else if (emp.shiftType === "shift" && (rawStatus === "D" || rawStatus === "N")) {
        currentShift = rawStatus === "D" ? "day" : "night";
      }

      if (rawStatus === "D" || rawStatus === "N") {
        totalMinutesWorked += 11 * 60; // To'liq 11 soat
      } else if (rawStatus.startsWith("+@")) {
        const timeStr = rawStatus.split("@")[1];
        let [hour, min] = timeStr.split(":").map(Number);
        let checkIn = new Date(year, month - 1, day, hour, min);
        let startOfShift, endOfShift;
        if (emp.shiftType === "shift") {
          startOfShift = new Date(year, month - 1, day, currentShift === "day" ? 8 : 20, 0);
          endOfShift = new Date(year, month - 1, day, currentShift === "day" ? 20 : 8, 0);
          if (currentShift === "night" && hour < 8) endOfShift.setDate(endOfShift.getDate() + 1);
        } else {
          startOfShift = new Date(year, month - 1, day, 8, 0);
          endOfShift = new Date(year, month - 1, day, 17, 0);
        }
        if (checkIn <= startOfShift) {
          totalMinutesWorked += (endOfShift - startOfShift) / 60000;
        } else {
          const diff = Math.max(0, (endOfShift - checkIn) / 60000);
          totalMinutesWorked += diff;
        }
      } else if (rawStatus.startsWith("O@")) {
        const [, timeStr, overtimeHours] = rawStatus.split("@");
        let [hour, min] = timeStr.split(":").map(Number);
        let checkIn = new Date(year, month - 1, day, hour, min);
        let startOfShift, endOfShift;
        if (emp.shiftType === "shift") {
          startOfShift = new Date(year, month - 1, day, currentShift === "day" ? 8 : 20, 0);
          endOfShift = new Date(year, month - 1, day, currentShift === "day" ? 20 : 8, 0);
          if (currentShift === "night" && hour < 8) endOfShift.setDate(endOfShift.getDate() + 1);
        } else {
          startOfShift = new Date(year, month - 1, day, 8, 0);
          endOfShift = new Date(year, month - 1, day, 17, 0);
        }
        let baseMinutes = 0;
        if (checkIn <= startOfShift) {
          baseMinutes = (endOfShift - startOfShift) / 60000;
        } else {
          baseMinutes = Math.max(0, (endOfShift - checkIn) / 60000);
        }
        totalMinutesWorked += baseMinutes + (Number(overtimeHours) || 0) * 60;
      } else if (rawStatus.startsWith("E@")) {
        const [, timeStr] = rawStatus.split("@");
        let [hour, min] = timeStr.split(":").map(Number);
        let leaveTime = new Date(year, month - 1, day, hour, min);
        let startOfShift;
        if (emp.shiftType === "shift") {
          startOfShift = new Date(year, month - 1, day, currentShift === "day" ? 8 : 20, 0);
        } else {
          startOfShift = new Date(year, month - 1, day, 8, 0);
        }
        const diff = Math.max(0, (leaveTime - startOfShift) / 60000);
        totalMinutesWorked += diff;
      }
    }

    const workedHours = Math.floor(totalMinutesWorked / 60);
    const workedMinutes = totalMinutesWorked % 60;
    const timeTd = tr.querySelector("td:nth-child(7)");
    timeTd.textContent = `${workedHours}h${workedMinutes}m`;

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

function checkLateTime(dateStr, name, shiftType, expectedShift, hours, minutes) {
  if (shiftType !== "shift") {
    if (hours > 8 || (hours === 8 && minutes > 10)) {
      alert(`⚠️ ${name} ${dateStr} kuni 08:10 dan kech keldi!`);
    }
  } else {
    if (expectedShift === "day" && (hours > 8 || (hours === 8 && minutes > 10))) {
      alert(`⚠️ ${name} ${dateStr} kuni day shift uchun 08:10 dan kech keldi!`);
    } else if (expectedShift === "night" && (hours > 20 || (hours === 20 && minutes > 10))) {
      alert(`⚠️ ${name} ${dateStr} kuni night shift uchun 20:10 dan kech keldi!`);
    }
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
  const shiftType = form.shiftType.value.trim();

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
      shiftType: shiftType || null,
      role: "employee",
      vacationLeft: 0
    });

    statusMsg.textContent = "✅ Hodim muvaffaqiyatli qo‘shildi!";
    form.reset();
    globalEmployees = await loadEmployees();
    drawTabel(monthSelect.value, globalEmployees);
  } catch (error) {
    statusMsg.textContent = "❌ Xatolik: " + error.message;
  }
});

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
      shiftType,
      vacationLeft
    } = data;

    employees.push({
      uid: userDoc.id,
      firstName,
      lastName,
      email,
      position,
      startDate,
      shiftType,
      vacationLeft
    });

    const shiftOptions = `
      <select class="shift-select border px-2 py-1" data-uid="${userDoc.id}">
        <option value="" ${!shiftType ? "selected" : ""}>Oddiy</option>
        <option value="shift" ${shiftType === "shift" ? "selected" : ""}>Shiftli</option>
      </select>
    `;

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
        <td class="border px-4 py-2">${shiftOptions}</td>
        <td class="border px-4 py-2 text-green-600 font-semibold">${vacationLeft} days</td>
      </tr>
    `;

    employeeTableBody.insertAdjacentHTML("beforeend", row);
  }

  document.querySelectorAll(".shift-select").forEach(select => {
    select.addEventListener("change", async (e) => {
      const uid = e.target.dataset.uid;
      const newShiftType = e.target.value;
      await updateDoc(doc(db, "users", uid), {
        shiftType: newShiftType || null
      });
      globalEmployees = await loadEmployees();
      drawTabel(monthSelect.value, globalEmployees);
    });
  });

  return employees;
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

export async function bulkAutoMarkAbsent() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  const today = getTodayString();
  const monthStr = today.slice(0, 7);
  const docRef = doc(db, "attendance", monthStr);
  const snap = await getDoc(docRef);
  const attendanceData = snap.exists() ? snap.data() : {};

  const usersSnapshot = await getDocs(collection(db, "users"));
  let updated = false;

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;
    const userData = userDoc.data();
    const userDays = attendanceData[uid] || {};

    let isRestDay = false;
    let expectedShift = null;
    if (userData.shiftType === "shift") {
      const startDate = new Date(userData.startDate);
      const todayDate = new Date(today);
      const daysSinceHire = Math.floor((todayDate - startDate) / (1000 * 60 * 60 * 24));
      const cyclePosition = daysSinceHire % 4;
      isRestDay = cyclePosition >= 2;
      if (!isRestDay) {
        expectedShift = cyclePosition === 0 ? "day" : "night";
      }
    }

    if (userDays[today] || isRestDay) continue;

    let lateHour, lateMinute = 10;
    if (userData.shiftType === "shift") {
      lateHour = expectedShift === "day" ? 8 : 20;
    } else {
      lateHour = 8;
    }

    if (hour < lateHour || (hour === lateHour && minute <= lateMinute)) {
      console.log(`⏳ ${uid} uchun hali absent belgilanmaydi.`);
      continue;
    }

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
  const todayMonth = new Date().toISOString().slice(0, 7);
  bulkAutoMarkAbsent();
  loadAttendanceData(todayMonth);
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
    document.getElementById("dayOffSection").classList.add("hidden");
    section.classList.remove("hidden");
  }

  navEmployees.addEventListener("click", () => showSection(employeesSection));
  navAttendance.addEventListener("click", () => showSection(attendanceSection));
  navVacations.addEventListener("click", () => showSection(vacationRequestsSection));
});

const vacationModal = document.getElementById("vacationModal");
const vacationModalContent = document.getElementById("vacationModalContent");
const vacationRequestsTableBody = document.getElementById("vacationRequestsTableBody");

async function loadVacationRequests() {
  const querySnapshot = await getDocs(collection(db, "vacationRequests"));
  vacationRequestsTableBody.innerHTML = "";

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

async function handleVacationAction(vacationId, action, vacationData) {
  const vacationRef = doc(db, "vacationRequests", vacationId);

  try {
    await updateDoc(vacationRef, { status: action });
    const uid = vacationData.uid;

    if (action === "Approved") {
      const start = new Date(vacationData.startDate);
      const end = new Date(vacationData.endDate);
      const timeDiff = end.getTime() - start.getTime();
      const dayCount = Math.floor(timeDiff / (1000 * 3600 * 24)) + 1;

      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        console.error("User not found for UID:", uid);
        return;
      }

      const userData = userSnap.data();
      const currentVacationLeft = userData.vacationLeft ?? 0;
      const updatedLeft = Math.max(0, currentVacationLeft - dayCount);

      await updateDoc(userRef, { vacationLeft: updatedLeft });
      console.log(`✅ VacationLeft updated for ${vacationData.fullName}: ${updatedLeft}`);
    }

    loadEmployees();
    loadVacationRequests();
    vacationModal.classList.add("hidden");
  } catch (error) {
    console.error("❌ Error handling vacation action:", error);
  }
}
window.handleVacationAction = handleVacationAction;

document.getElementById("navVacations").addEventListener("click", () => {
  document.getElementById("employeesSection").classList.add("hidden");
  document.getElementById("attendanceSection").classList.add("hidden");
  document.getElementById("dayOffSection").classList.add("hidden");
  document.getElementById("vacationRequestsSection").classList.remove("hidden");
  loadVacationRequests();
});

async function loadDayOffs() {
  const dayOffBody = document.getElementById("dayOffTableBody");
  dayOffBody.innerHTML = "";

  const q = query(collection(db, "absenceReasons"));
  const querySnapshot = await getDocs(q);

  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data();
    const userSnap = await getDoc(doc(db, "users", data.uid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="p-2 border">${userData.firstName || ""} ${userData.lastName || ""}</td>
      <td class="p-2 border">${data.date || "-"}</td>
      <td class="p-2 border">${data.reason || "-"}</td>
      <td class="p-2 border">${data.untilDate || "-"}</td>
      <td class="p-2 border">${data.isMedical ? "✅" : "❌"}</td>
    `;
    dayOffBody.appendChild(tr);
  }
}

document.getElementById("navDayOff").addEventListener("click", () => {
  document.getElementById("employeesSection").classList.add("hidden");
  document.getElementById("attendanceSection").classList.add("hidden");
  document.getElementById("vacationRequestsSection").classList.add("hidden");
  document.getElementById("dayOffSection").classList.remove("hidden");
  loadDayOffs();
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