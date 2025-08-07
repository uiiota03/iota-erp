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
const OFFICE_LOCATION = { lat: 41.430552, lng: 69.531879 }; // Exact office location
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
const absenceBtn = document.getElementById("absenceBtn"); // Yangi tugma

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

// function isWeekend(date) {
//     const day = date.getDay();
//     return day === 0 || day === 6;
// }

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Yangi funksiya: Kela olmaganlikni bildirish
function showAbsenceModal() {
    document.getElementById("absenceModal").classList.remove("hidden");
}

function hideAbsenceModal() {
    document.getElementById("absenceModal").classList.add("hidden");
}

async function reportAbsenceModal(uid) {
    showAbsenceModal();

    const submitBtn = document.getElementById("submitAbsenceBtn");
    const cancelBtn = document.getElementById("cancelAbsenceBtn");

    const handleSubmit = async () => {
        const reason = document.getElementById("absenceReason").value.trim();
        const untilDate = document.getElementById("absenceUntil").value;
        const isMedical = document.getElementById("isMedical").checked;

        if (!reason) {
            alert("⚠️ Sababni kiriting.");
            return;
        }

        const today = getTodayString();
        const monthStr = today.slice(0, 7);
        const docRef = doc(db, "attendance", monthStr);
        const absenceDocRef = doc(db, "absenceReasons", `${uid}_${today}`);

        const snap = await getDoc(docRef);
        let data = snap.exists() ? snap.data() : {};
        if (!data[uid]) data[uid] = {};
        data[uid][today] = "-";

        await setDoc(absenceDocRef, {
            uid,
            date: today,
            reason,
            untilDate: untilDate || null,
            isMedical,
            timestamp: new Date()
        });

        await setDoc(docRef, data);

        alert("✅ Kela olmaslik sababi saqlandi.");

        // Tugmalarni o‘chirish
        absenceBtn.disabled = true;
        absenceBtn.textContent = "Qayd etildi";
        absenceBtn.classList.add("opacity-50", "cursor-not-allowed");

        checkInBtn.disabled = true;
        checkInBtn.textContent = "Check-in yopilgan";
        checkInBtn.classList.add("opacity-50", "cursor-not-allowed", "bg-red-400");

        await loadAttendance(uid, monthStr);
        await updateCheckInState(uid);

        hideAbsenceModal();
        removeListeners(); // oldingi listenerlarni olib tashlash
    };

    const removeListeners = () => {
        submitBtn.removeEventListener("click", handleSubmit);
        cancelBtn.removeEventListener("click", hideAbsenceModal);
    };

    submitBtn.addEventListener("click", handleSubmit);
    cancelBtn.addEventListener("click", () => {
        hideAbsenceModal();
        removeListeners();
    });
}

// Check-In handler
async function checkIn(uid) {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    const today = getTodayString();
    const monthStr = today.slice(0, 7);
    const docRef = doc(db, "attendance", monthStr);
    const snap = await getDoc(docRef);
    let data = snap.exists() ? snap.data() : {};

    if (!data[uid]) data[uid] = {};

    if (hour >= 17) {
        alert("⚠️ Soat 17:00 dan kech bo‘ldi. Siz ishga kelmagan deb belgilandingiz.");
        data[uid][today] = "-";
        await setDoc(docRef, data);

        checkInBtn.disabled = true;
        checkInBtn.textContent = "Checked";
        checkInBtn.classList.add("opacity-50", "cursor-not-allowed");

        loadAttendance(uid, monthStr);
        updateCheckInState(uid);
        return;
    }

    if (hour > 8 || (hour === 8 && minute > 10)) {
        alert("⚠️ Siz kechikdingiz, ammo check-in qabul qilindi.");
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
                alert("📍 Siz ofis hududida emassiz. Check-in amalga oshmadi.");
                return reject("Out of range");
            }

            const timeStr = now.toTimeString().slice(0, 5);
            data[uid][today] = `+@${timeStr}`;
            await setDoc(docRef, data);

            checkInBtn.disabled = true;
            checkInBtn.textContent = "Checked";
            checkInBtn.classList.add("opacity-50", "cursor-not-allowed");

            loadAttendance(uid, monthStr);
            updateCheckInState(uid);
            resolve();
        }, (err) => {
            alert("📵 Geolocation permission rad etildi.");
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
                const isLate = h > 8 || (h === 8 && m > 20);
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
            // Sababni Firestore'dan olish
            const absenceDocRef = doc(db, "absenceReasons", `${uid}_${date}`);
            const absenceSnap = await getDoc(absenceDocRef);
            tooltip = absenceSnap.exists() ? `❌ Kelmagan: ${absenceSnap.data().reason}` : "❌ Kelmagan";
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
        cell.id = `day-${date}`;
        calendar.appendChild(cell);
    }
}

// Month dropdown setup
function generateMonthOptions() {
    const now = new Date();
    const currentYear = now.getFullYear();

    for (let month = 1; month < 13; month++) {
        const date = new Date(currentYear, month, 0);
        const val = getMonthString(date);

        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = date.toLocaleString("uz-UZ", { month: "long", year: "numeric" });

        if (val === getMonthString(now)) opt.selected = true;
        monthSelect.appendChild(opt);
    }

    currentMonthLabel.textContent = getMonthString(now);
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

async function updateCheckInState(uid) {
    const today = getTodayString();
    const monthStr = today.slice(0, 7);
    const docRef = doc(db, "attendance", monthStr);
    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : {};
    const status = data[uid]?.[today] || null; // Use null as a fallback if status is undefined

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Absence button is always visible
    absenceBtn.style.display = "block";
    absenceBtn.textContent = "Day off";
    absenceBtn.classList.remove("bg-red-400", "opacity-50", "cursor-not-allowed");
    absenceBtn.classList.add("bg-orange-500");

    if (status && status.startsWith("+@")) {
        const timeStr = status.split("@")[1];
        const [h, m] = timeStr.split(":").map(Number);
        const isLate = h > 8 || (h === 8 && m > 10);

        checkInBtn.textContent = isLate
            ? `Kechikib keldi - ${timeStr}`
            : `Checked In - ${timeStr}`;
        checkInBtn.disabled = true;
        checkInBtn.classList.add("opacity-50", "cursor-not-allowed", isLate ? "bg-yellow-400" : "bg-green-500");
        checkInBtn.classList.remove("bg-blue-500");

        // Disable absence button
        absenceBtn.disabled = true;
        absenceBtn.classList.add("opacity-50", "cursor-not-allowed");
    } else if (status === "-" || status === "absent" || (status && status.startsWith("-@"))) {
        checkInBtn.textContent = "Check-in yopilgan (kelmagan)";
        checkInBtn.disabled = true;
        checkInBtn.classList.add("opacity-50", "cursor-not-allowed", "bg-red-400");
        checkInBtn.classList.remove("bg-blue-500");

        absenceBtn.disabled = true;
        absenceBtn.classList.add("opacity-50", "cursor-not-allowed");
        absenceBtn.textContent = "Qayd etildi";
    } else {
        if (hour >= 17) {
            checkInBtn.textContent = "Check-in yopilgan (kech bo‘ldi)";
            checkInBtn.disabled = true;
            checkInBtn.classList.add("opacity-50", "cursor-not-allowed", "bg-red-400");
            checkInBtn.classList.remove("bg-blue-500");

            absenceBtn.disabled = true;
            absenceBtn.classList.add("opacity-50", "cursor-not-allowed");
        } else {
            checkInBtn.textContent = "Check In";
            checkInBtn.disabled = false;
            checkInBtn.classList.remove("opacity-50", "cursor-not-allowed", "bg-red-400", "bg-yellow-400", "bg-green-500");
            checkInBtn.classList.add("bg-blue-500");

            absenceBtn.disabled = false;
            absenceBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
    }
}

// Auth state check
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        localStorage.removeItem("userData");
        return (window.location.href = "index.html");
    }

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        console.warn("❌ Firestore’da user topilmadi.");
        localStorage.removeItem("userData");
        await signOut(auth);
        return (window.location.href = "index.html");
    }

    const userData = userSnap.data();
    localStorage.setItem("userData", JSON.stringify(userData));

    nameEl.textContent = `${userData.firstName} ${userData.lastName}`;
    roleEl.textContent = userData.position;
    startDateEl.textContent = userData.startDate;

    generateMonthOptions();

    const thisMonth = getMonthString(new Date());
    currentMonthLabel.textContent = thisMonth;
    await loadAttendance(user.uid, thisMonth);
    await markApprovedVacationsOnCalendar();
    await updateCheckInState(user.uid);

    checkInBtn.addEventListener("click", async () => {
        await checkIn(user.uid);
        await updateCheckInState(user.uid);
    });

    // Yangi tugma uchun event listener
    absenceBtn.addEventListener("click", async () => {
        await reportAbsenceModal(user.uid); // Yangi modal funksiyani chaqiramiz
        await updateCheckInState(user.uid); // Modal yopilgandan keyin state yangilanadi
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