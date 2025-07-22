// employee.js
import { auth, db } from "./firebase-config.js";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc
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
    return new Date().toISOString().split("T")[0];
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
                alert("You are not in the office area. Attendance not recorded.");
                return reject("Out of range");
            }

            const today = getTodayString();
            const monthStr = today.slice(0, 7);
            const docRef = doc(db, "attendance", monthStr);
            const snap = await getDoc(docRef);
            let data = snap.exists() ? snap.data() : {};

            if (!data[uid]) data[uid] = {};
            data[uid][today] = "+";

            await setDoc(docRef, data);
            loadAttendance(uid, monthStr);
            resolve();
        }, (err) => {
            alert("Geolocation permission denied.");
            reject(err);
        });
    });
}

async function loadAttendance(uid, monthStr) {
    const [year, month] = monthStr.split("-").map(Number);
    const docRef = doc(db, "attendance", monthStr); // ✅ To'g'ri reference
    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : {};
    const userAttendance = data[uid] || {};

    calendar.innerHTML = "";

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1);
    const offset = firstDay.getDay();
    const todayStr = getTodayString();

    // 🗓 Weekday header
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    weekdays.forEach(day => {
        const cell = document.createElement("div");
        cell.textContent = day;
        cell.className = "text-center font-semibold text-gray-700";
        calendar.appendChild(cell);
    });

    // ⬜️ Empty cells before first day
    for (let i = 0; i < offset; i++) {
        const empty = document.createElement("div");
        calendar.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = `${monthStr}-${String(d).padStart(2, "0")}`;
        const cell = document.createElement("div");
        const current = new Date(year, month - 1, d);
        const status = userAttendance[date] || "-";
        const isWeekendDay = current.getDay() === 0 || current.getDay() === 6;
        const isToday = date === todayStr;
        const isPast = date < todayStr;
        const isFuture = date > todayStr;

        let bgColor = "bg-gray-200"; // default

        if (isWeekendDay) {
            bgColor = "bg-yellow-300"; // 🟨 Always yellow for weekends
        } else if (status === "+") {
            bgColor = "bg-green-500 text-white"; // ✅ Checked-in
        } else if (isPast) {
            bgColor = "bg-red-400 text-white"; // ❌ Missed
        } else if (isToday) {
            bgColor = "bg-blue-400 text-white"; // 🔵 Today
        }

        cell.className = `p-2 rounded text-center ${bgColor}`;
        cell.textContent = d;
        calendar.appendChild(cell);
    }
}


// Month dropdown setup
function generateMonthOptions() {
    const now = new Date();
    const currentMonthStr = getMonthString(now);

    for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = getMonthString(date);
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = date.toLocaleString("en-US", { month: "long", year: "numeric" });
        if (val === currentMonthStr) opt.selected = true;
        monthSelect.appendChild(opt);
    }

    currentMonthLabel.textContent = currentMonthStr;
}

// Check-in state check
async function updateCheckInState(uid) {
    const today = getTodayString();
    const monthStr = today.slice(0, 7);
    const docRef = doc(db, "attendance", monthStr);
    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : {};
    const checkedIn = data[uid] && data[uid][today] === "+";
    if (checkedIn) {
        checkInBtn.textContent = `Checked In - ${today}`;
        checkInBtn.disabled = true;
        checkInBtn.classList.add("bg-green-500");
    } else {
        checkInBtn.textContent = `Check In - ${today}`;
        checkInBtn.disabled = false;
    }
}

// Auth state check
onAuthStateChanged(auth, async (user) => {
    if (!user) return (window.location.href = "index.html");
    const storedData = localStorage.getItem("userData");
    if (!storedData) {
        alert("User data not found.");
        return signOut(auth);
    }

    const userData = JSON.parse(storedData);
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

    monthSelect.addEventListener("change", () => {
        const selectedMonth = monthSelect.value;
        currentMonthLabel.textContent = selectedMonth;
        loadAttendance(user.uid, selectedMonth);
    });
});
