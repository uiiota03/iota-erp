// employee.js
import { auth, db } from "./firebase-config.js";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    query,
    collection,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Constants
const OFFICE_LOCATION = { lat: 41.430552, lng: 69.531879 }; // Exact office location (based on your Google Maps link)
const MAX_DISTANCE_KM = 0.5; // 500 meters allowed radius

// DOM Elements
const nameEl = document.getElementById("employeeName");
const roleEl = document.getElementById("employeeRole");
const startDateEl = document.getElementById("employeeStartDate");
const checkInBtn = document.getElementById("checkInBtn");
const logoutBtn = document.getElementById("logoutBtn");
const calendar = document.getElementById("calendar");
const monthSelect = document.getElementById("monthSelect");
const currentMonthLabel = document.getElementById("currentMonthLabel");

// Utility
function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}


function getMonthString(date) {
    return date.toISOString().slice(0, 7);
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Check-In handler
async function checkIn(uid) {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    if (hour > 8 || (hour === 8 && minute > 10)) {
        alert("⚠️ Siz kechikdingiz, ammo check-in qabul qilindi.");
        // Continue check-in anyway
    }


    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            const distance = calculateDistance(
                latitude,
                longitude,
                OFFICE_LOCATION.lat,
                OFFICE_LOCATION.lng
            );

            if (distance > MAX_DISTANCE_KM) {
                alert("Siz ofis hududida emassiz. Check-in amalga oshmadi.");
                return reject("Out of range");
            }

            const now = new Date();
            const timeStr = now.toTimeString().slice(0, 5); // "08:03"
            const today = getTodayString();
            const monthStr = today.slice(0, 7);

            const docRef = doc(db, "attendance", monthStr);
            const snap = await getDoc(docRef);
            let data = snap.exists() ? snap.data() : {};

            if (!data[uid]) data[uid] = {};
            data[uid][today] = `+@${timeStr}`; // ✅ saqlanadi: +@08:03

            await setDoc(docRef, data);
            loadAttendance(uid, monthStr);
            updateCheckInState(uid);
            resolve();
        }, (err) => {
            alert("Geolocation permission denied.");
            reject(err);
        });
    });
}

async function loadAttendance(uid, monthStr) {
    const [year, month] = monthStr.split("-").map(Number);
    const docRef = doc(db, "attendance", monthStr);
    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : {};
    const userAttendance = data[uid] || {};

    calendar.innerHTML = "";

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();
    const todayStr = getTodayString();

    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    weekdays.forEach(day => {
        const cell = document.createElement("div");
        cell.textContent = day;
        cell.className = "text-center font-semibold text-gray-700";
        calendar.appendChild(cell);
    });

    for (let i = 0; i < firstDay; i++) {
        calendar.appendChild(document.createElement("div"));
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = `${monthStr}-${String(d).padStart(2, "0")}`;
        const current = new Date(year, month - 1, d);
        const isWeekend = current.getDay() === 0 || current.getDay() === 6;
        const isToday = date === todayStr;

        const cell = document.createElement("div");
        const status = userAttendance[date];

        let bgColor = "bg-gray-200";
        let tooltip = "Ma'lumot yo'q";

        if (status?.startsWith("+")) {
            const timeStr = status.includes("@") ? status.split("@")[1] : null;

            if (timeStr) {
                const [h, m] = timeStr.split(":").map(Number);
                const isLate = h > 8 || (h === 8 && m > 10);
                bgColor = isLate ? "bg-green-100 text-black" : "bg-green-500 text-white";
                tooltip = isLate
                    ? `⏰ Kechikib keldi: ${timeStr}`
                    : `✅ Vaqtida keldi: ${timeStr}`;
            } else {
                bgColor = "bg-green-500 text-white";
                tooltip = `✅ Kelgan (vaqtsiz)`;
            }
        } else if (status === "-") {
            bgColor = "bg-red-600 text-white";
            tooltip = "❌ Kelmagan";
        } else if (isWeekend) {
            bgColor = "bg-yellow-200";
            tooltip = "🟡 Dam olish kuni";
        } else if (isToday) {
            bgColor = "bg-blue-400 text-white";
            tooltip = "📅 Bugungi kun";
        }

        cell.className = `p-2 rounded text-center ${bgColor}`;
        cell.textContent = d;
        cell.title = tooltip;
        cell.id = `day-${date}`

        calendar.appendChild(cell);
    }
}

// Month dropdown setup
function generateMonthOptions() {
    const now = new Date();
    const currentYear = now.getFullYear();

    for (let month = 1; month < 13; month++) {
        const date = new Date(currentYear, month, 0);
        const val = getMonthString(date); // format: yyyy-mm

        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = date.toLocaleString("uz-UZ", { month: "long", year: "numeric" });

        if (val === getMonthString(now)) opt.selected = true;
        monthSelect.appendChild(opt);
    }

    currentMonthLabel.textContent = getMonthString(now);
}

async function updateCheckInState(uid) {
    const today = getTodayString();
    const monthStr = today.slice(0, 7);
    const docRef = doc(db, "attendance", monthStr);
    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : {};
    const status = data[uid]?.[today];

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const isLate = hour > 8 || (hour === 8 && minute > 10);

    if (status && status.startsWith("+@")) {
        const timeStr = status.split("@")[1];
        const [h, m] = timeStr.split(":").map(Number);
        const isLate = h > 8 || (h === 8 && m > 10);

        checkInBtn.textContent = isLate
            ? `Kechikib keldi - ${timeStr}`
            : `Checked In - ${timeStr}`;
        checkInBtn.disabled = true;
        checkInBtn.classList.add(isLate ? "bg-yellow-400" : "bg-green-500");
    }
}

async function markApprovedVacationsOnCalendar() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const q = query(
            collection(db, "vacationRequests"),
            where("uid", "==", user.uid),
            where("status", "==", "Approved")
        );

        const snapshot = await getDocs(q);

        snapshot.forEach(doc => {
            const data = doc.data();
            const start = new Date(data.startDate);
            const end = new Date(data.endDate);

            for (
                let d = new Date(start);
                d.getTime() <= new Date(end).getTime();
                d.setDate(d.getDate() + 1)
            ) {
                const dateStr = d.toISOString().split("T")[0];
                const cell = document.getElementById(`day-${dateStr}`);
                if (cell) {
                    cell.classList.add("bg-yellow-300", "text-black", "font-semibold");
                    cell.title = "Vacation";
                }
            }
        });
    } catch (err) {
        console.error("❌ Vacation data error:", err);
    }
}


// Auth state check
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // ❌ Login qilinmagan foydalanuvchi
        return (window.location.href = "index.html");
    }

    // 🔍 Firestore'dan tekshiramiz
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        console.warn("Firestore’da user topilmadi.");
        localStorage.removeItem("userData"); // ✅ localStorage tozalandi
        await signOut(auth);
        return (window.location.href = "index.html");
    }

    // ✅ User ma’lumotlari mavjud — davom etamiz
    const userData = userSnap.data();

    // localStorage'da saqlaymiz (agar kerak bo‘lsa)
    localStorage.setItem("userData", JSON.stringify(userData));

    // DOM elementlarni to‘ldiramiz
    nameEl.textContent = `${userData.firstName} ${userData.lastName}`;
    roleEl.textContent = userData.position;
    startDateEl.textContent = userData.startDate;

    generateMonthOptions();

    const thisMonth = getMonthString(new Date());
    loadAttendance(user.uid, thisMonth);
    updateCheckInState(user.uid);

    checkInBtn.addEventListener("click", async () => {
        await checkIn(user.uid);
        updateCheckInState(user.uid);
    });

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("userData");
        signOut(auth);
    });

    monthSelect.addEventListener("change", async () => {
        const selectedMonth = monthSelect.value;
        currentMonthLabel.textContent = selectedMonth;

        await loadAttendance(user.uid, selectedMonth);
        await markApprovedVacationsOnCalendar();
    });
});