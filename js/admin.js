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
  doc
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

const formatMonth = (date) => date.toISOString().slice(0, 7);

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

async function loadAttendanceData(monthStr) {
  const docRef = doc(db, "attendance", monthStr);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return {};
  return docSnap.data(); // ✅ bunda natija {uid: {date: value, ...}, ...}
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
    <th class="border px-2 py-1">#</th>
    <th class="border px-2 py-1">Ism</th>
    <th class="border px-2 py-1">Familiya</th>
    <th class="border px-2 py-1">Kelgan</th>
    <th class="border px-2 py-1">Kelmagan</th>
    <th class="border px-2 py-1">Vaqt</th>
  `;

  tabelBody.innerHTML = "";

  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const attendanceData = await loadAttendanceData(monthStr);

  // Har bir kun uchun header qo‘shish
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

    // So‘nggi kun uchun vaqtni chiqaramiz
    const today = formatDate(new Date());
    const lastEntry = attendanceData?.[emp.uid]?.[today] || "";
    const checkinTime = getCheckinTime(lastEntry);

    tr.innerHTML = `
      <td class="border px-2 py-1">${index + 1}</td>
      <td class="border px-2 py-1">${emp.firstName}</td>
      <td class="border px-2 py-1">${emp.lastName}</td>
      <td class="border px-2 py-1 text-green-600 font-bold" id="present-${emp.uid}">${present}</td>
      <td class="border px-2 py-1 text-red-600 font-bold" id="absent-${emp.uid}">${absent}</td>
      <td class="border px-2 py-1 text-xs">${checkinTime}</td>
    `;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
      const cell = document.createElement("td");
      cell.className = "border text-center text-sm px-2 py-1";
      cell.contentEditable = true;
      cell.dataset.uid = emp.uid;
      cell.dataset.day = dateStr;

      let status = attendanceData?.[emp.uid]?.[dateStr] || "";

      // Agar '@' bo‘lsa, faqat belgini ajratib olamiz
      if (status.includes("@")) status = status.split("@")[0];

      cell.textContent = status;

      if (status === "+") present++;
      else if (status === "-") absent++;

      cell.addEventListener("blur", async () => {
        const newStatus = cell.textContent.trim();

        // Check-in time qo‘shiladi agar yangi + bo‘lsa
        let valueToSave = newStatus;
        if (newStatus === "+") {
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          valueToSave = `+@${timeStr}`;
        }

        await saveAttendance(emp.uid, dateStr, valueToSave);
        if (newStatus === "+") checkLateTime(dateStr, emp.firstName);
        drawTabel(monthStr, employees); // refresh
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

/** Initial load **/
generateMonths();
loadEmployees();
