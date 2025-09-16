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
const shiftTypeEl = document.getElementById("employeeShiftType");
const checkInBtn = document.getElementById("checkInBtn");
const logoutBtn = document.getElementById("logoutBtn");
const calendar = document.getElementById("calendar");
const monthSelect = document.getElementById("monthSelect");
const currentMonthLabel = document.getElementById("currentMonthLabel");
const absenceBtn = document.getElementById("absenceBtn");
const loader = document.getElementById("loader");

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

// Absence Modal Functions
function showAbsenceModal() {
    document.getElementById("absenceModal").classList.remove("hidden");
}

function hideAbsenceModal() {
    document.getElementById("absenceModal").classList.add("hidden");
}

async function reportAbsenceModal(uid) {
    try {
        loader.classList.remove("hidden");
        showAbsenceModal();
        const submitBtn = document.getElementById("submitAbsenceBtn");
        const cancelBtn = document.getElementById("cancelAbsenceBtn");

        const handleSubmit = async () => {
            try {
                loader.classList.remove("hidden");
                const reason = document.getElementById("absenceReason").value.trim();
                const untilDate = document.getElementById("absenceUntil").value;
                const isMedical = document.getElementById("isMedical").checked;

                if (!reason) {
                    alert("⚠️ Sababni kiriting.");
                    loader.classList.add("hidden");
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

                absenceBtn.disabled = true;
                absenceBtn.textContent = "Qayd etildi";
                absenceBtn.classList.add("opacity-50", "cursor-not-allowed");

                checkInBtn.disabled = true;
                checkInBtn.textContent = "Check-in yopilgan";
                checkInBtn.classList.add("opacity-50", "cursor-not-allowed", "bg-red-400");

                await loadAttendance(uid, monthStr);
                await updateCheckInState(uid);

                hideAbsenceModal();
                removeListeners();
                loader.classList.add("hidden");
            } catch (error) {
                console.error("❌ Absence report xatosi:", error);
                alert("⚠️ Kela olmaslik sababini saqlashda xato yuz berdi.");
                loader.classList.add("hidden");
            }
        };

        const removeListeners = () => {
            submitBtn.removeEventListener("click", handleSubmit);
            cancelBtn.removeEventListener("click", hideAbsenceModal);
        };

        submitBtn.addEventListener("click", handleSubmit);
        cancelBtn.addEventListener("click", () => {
            hideAbsenceModal();
            removeListeners();
            loader.classList.add("hidden");
        });
    } catch (error) {
        console.error("❌ Absence modal xatosi:", error);
        alert("⚠️ Modal ochishda xato yuz berdi.");
        loader.classList.add("hidden");
    }
}

// Check-In Handler with Shift Logic
async function checkIn(uid, userData) {
    try {
        loader.classList.remove("hidden");
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const today = getTodayString();
        const monthStr = today.slice(0, 7);

        const isShiftEmployee = userData.shiftType === "shift";
        let expectedShift = null;
        let isRestDay = false;

        if (isShiftEmployee) {
            const startDate = new Date(userData.startDate);
            const daysSinceHire = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
            const cyclePosition = daysSinceHire % 4;
            isRestDay = cyclePosition >= 2;
            if (!isRestDay) {
                expectedShift = cyclePosition === 0 ? "day" : "night";
            }
        }

        // Check for late check-in (10-minute grace period)
        if (isShiftEmployee && !isRestDay) {
            if (expectedShift === "day" && (hour > 8 || (hour === 8 && minute > 10))) {
                alert("⚠️ Siz kunduzgi smenada kechikdingiz, ammo check-in qabul qilindi.");
            } else if (expectedShift === "night" && (hour > 20 || (hour === 20 && minute > 10))) {
                alert("⚠️ Siz tungi smenada kechikdingiz, ammo check-in qabul qilindi.");
            }
        } else if (!isShiftEmployee && (hour > 8 || (hour === 8 && minute > 10))) {
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
                    loader.classList.add("hidden");
                    return reject("Out of range");
                }

                const timeStr = now.toTimeString().slice(0, 5);
                const docRef = doc(db, "attendance", monthStr);
                const snap = await getDoc(docRef);
                let data = snap.exists() ? snap.data() : {};
                if (!data[uid]) data[uid] = {};

                // Shiftli hodimlar uchun vaqtga qarab D yoki N saqlanadi
                if (isShiftEmployee && !isRestDay) {
                    const currentShift = (hour >= 8 && hour < 20) ? "D" : "N";
                    data[uid][today] = currentShift;
                } else {
                    data[uid][today] = `+@${timeStr}`;
                }

                await setDoc(docRef, data);

                checkInBtn.disabled = true;
                checkInBtn.textContent = isShiftEmployee && !isRestDay ? (hour >= 8 && hour < 20 ? "Kunduzgi smena" : "Tungi smena") : `Checked In - ${timeStr}`;
                checkInBtn.classList.add("opacity-50", "cursor-not-allowed");
                checkInBtn.classList.remove("bg-blue-500");
                checkInBtn.classList.add(isShiftEmployee && !isRestDay ? (hour >= 8 && hour < 20 ? "bg-green-100" : "bg-blue-200") : "bg-green-500");

                await loadAttendance(uid, monthStr);
                await updateCheckInState(uid);
                loader.classList.add("hidden");
                resolve();
            }, (err) => {
                alert("📵 Geolocation permission rad etildi.");
                loader.classList.add("hidden");
                reject(err);
            });
        });
    } catch (error) {
        console.error("❌ Check-in xatosi:", error);
        alert("⚠️ Check-in jarayonida xato yuz berdi. Iltimos, qayta urinib ko‘ring.");
        loader.classList.add("hidden");
    }
}

async function loadAttendance(uid, monthStr) {
    loader.classList.remove("hidden");
    const [year, month] = monthStr.split("-").map(Number);
    const docRef = doc(db, "attendance", monthStr);
    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : {};
    const userAttendance = data[uid] || {};

    calendar.innerHTML = "";

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();
    const todayStr = getTodayString();

    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.exists() ? userSnap.data() : {};
    const isShiftEmployee = userData.shiftType === "shift";

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

        let isRestDay = false;
        let expectedShift = null;
        if (isShiftEmployee) {
            const startDate = new Date(userData.startDate);
            const daysSinceHire = Math.floor((current - startDate) / (1000 * 60 * 60 * 24));
            const cyclePosition = daysSinceHire % 4;
            isRestDay = cyclePosition >= 2;
            if (!isRestDay) {
                expectedShift = cyclePosition === 0 ? "day" : "night";
            }
        }

        const cell = document.createElement("div");
        const status = userAttendance[date];

        let bgColor = "bg-gray-200";
        let tooltip = "Ma'lumot yo'q";

        if (status === "D" && isShiftEmployee) {
            bgColor = "bg-green-100 text-black";
            tooltip = `🌞 Kunduzgi smena (11 soat)`;
        } else if (status === "N" && isShiftEmployee) {
            bgColor = "bg-blue-200 text-black";
            tooltip = `🌙 Tungi smena (11 soat)`;
        } else if (status?.startsWith("+")) {
            const timeStr = status.includes("@") ? status.split("@")[1] : null;
            if (timeStr) {
                const [h, m] = timeStr.split(":").map(Number);
                const isLate = isShiftEmployee
                    ? (expectedShift === "day" && (h > 8 || (h === 8 && m > 10))) ||
                      (expectedShift === "night" && (h > 20 || (h === 20 && m > 10)))
                    : (h > 8 || (h === 8 && m > 10));
                bgColor = isLate ? "bg-yellow-400 text-black" : "bg-green-500 text-white";
                tooltip = isLate
                    ? `⏰ Kechikib keldi: ${timeStr}`
                    : `✅ Vaqtida keldi: ${timeStr}`;
            } else {
                bgColor = "bg-green-500 text-white";
                tooltip = `✅ Kelgan (vaqtsiz)`;
            }
        } else if (status === "-") {
            bgColor = "bg-red-600 text-white";
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
    loader.classList.add("hidden");
}

// Month Dropdown Setup
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
    loader.classList.remove("hidden");
    const user = auth.currentUser;
    if (!user) {
        loader.classList.add("hidden");
        return;
    }

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
    } catch (error) {
        console.error("❌ Vacation data error:", error);
    }
    loader.classList.add("hidden");
}

async function updateCheckInState(uid) {
    try {
        loader.classList.remove("hidden");
        const today = getTodayString();
        const monthStr = today.slice(0, 7);
        const docRef = doc(db, "attendance", monthStr);
        const snap = await getDoc(docRef);
        const data = snap.exists() ? snap.data() : {};
        const status = data[uid]?.[today] || null;

        const userSnap = await getDoc(doc(db, "users", uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const isShiftEmployee = userData.shiftType === "shift";

        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        absenceBtn.style.display = "block";
        absenceBtn.textContent = "Day off";
        absenceBtn.classList.remove("bg-red-400", "opacity-50", "cursor-not-allowed");
        absenceBtn.classList.add("bg-orange-500");

        let isRestDay = false;
        let expectedShift = null;
        if (isShiftEmployee) {
            const startDate = new Date(userData.startDate);
            const daysSinceHire = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
            const cyclePosition = daysSinceHire % 4;
            isRestDay = cyclePosition >= 2;
            if (!isRestDay) {
                expectedShift = cyclePosition === 0 ? "day" : "night";
            }
        }

        if (status === "D" && isShiftEmployee) {
            checkInBtn.textContent = "Kunduzgi smena";
            checkInBtn.disabled = true;
            checkInBtn.classList.add("opacity-50", "cursor-not-allowed", "bg-green-100");
            checkInBtn.classList.remove("bg-blue-500");

            absenceBtn.disabled = true;
            absenceBtn.classList.add("opacity-50", "cursor-not-allowed");
            absenceBtn.textContent = "Qayd etildi";
        } else if (status === "N" && isShiftEmployee) {
            checkInBtn.textContent = "Tungi smena";
            checkInBtn.disabled = true;
            checkInBtn.classList.add("opacity-50", "cursor-not-allowed", "bg-blue-200");
            checkInBtn.classList.remove("bg-blue-500");

            absenceBtn.disabled = true;
            absenceBtn.classList.add("opacity-50", "cursor-not-allowed");
            absenceBtn.textContent = "Qayd etildi";
        } else if (status?.startsWith("+@")) {
            const timeStr = status.split("@")[1];
            const [h, m] = timeStr.split(":").map(Number);
            const isLate = isShiftEmployee
                ? (expectedShift === "day" && (h > 8 || (h === 8 && m > 10))) ||
                  (expectedShift === "night" && (h > 20 || (h === 20 && m > 10)))
                : (h > 8 || (h === 8 && m > 10));

            checkInBtn.textContent = isLate
                ? `Kechikib keldi - ${timeStr}`
                : `Checked In - ${timeStr}`;
            checkInBtn.disabled = true;
            checkInBtn.classList.add("opacity-50", "cursor-not-allowed", isLate ? "bg-yellow-400" : "bg-green-500");
            checkInBtn.classList.remove("bg-blue-500");

            absenceBtn.disabled = true;
            absenceBtn.classList.add("opacity-50", "cursor-not-allowed");
        } else if (status === "-") {
            checkInBtn.textContent = "Check-in yopilgan (kelmagan)";
            checkInBtn.disabled = true;
            checkInBtn.classList.add("opacity-50", "cursor-not-allowed", "bg-red-400");
            checkInBtn.classList.remove("bg-blue-500");

            absenceBtn.disabled = true;
            absenceBtn.classList.add("opacity-50", "cursor-not-allowed");
            absenceBtn.textContent = "Qayd etildi";
        } else {
            checkInBtn.textContent = isShiftEmployee && !isRestDay ? (hour >= 8 && hour < 20 ? "Check In (Kunduzgi)" : "Check In (Tungi)") : "Check In";
            checkInBtn.disabled = false;
            checkInBtn.classList.remove("opacity-50", "cursor-not-allowed", "bg-red-400", "bg-yellow-400", "bg-green-500", "bg-green-100", "bg-blue-200");
            checkInBtn.classList.add("bg-blue-500");

            absenceBtn.disabled = false;
            absenceBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
        loader.classList.add("hidden");
    } catch (error) {
        console.error("❌ updateCheckInState xatosi:", error);
        loader.classList.add("hidden");
    }
}

// Auth State Check
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        localStorage.removeItem("userData");
        loader.classList.add("hidden");
        return (window.location.href = "index.html");
    }

    loader.classList.remove("hidden");
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        console.warn("❌ Firestore’da user topilmadi.");
        localStorage.removeItem("userData");
        await signOut(auth);
        loader.classList.add("hidden");
        return (window.location.href = "index.html");
    }

    const userData = userSnap.data();
    localStorage.setItem("userData", JSON.stringify(userData));

    nameEl.textContent = `${userData.firstName} ${userData.lastName}`;
    roleEl.textContent = userData.position;
    startDateEl.textContent = userData.startDate;
    shiftTypeEl.textContent = userData.shiftType === "shift" ? "Shiftli" : "Oddiy";

    generateMonthOptions();

    const thisMonth = getMonthString(new Date());
    currentMonthLabel.textContent = thisMonth;
    await loadAttendance(user.uid, thisMonth);
    await markApprovedVacationsOnCalendar();
    await updateCheckInState(user.uid);

    checkInBtn.addEventListener("click", async () => {
        await checkIn(user.uid, userData);
        await updateCheckInState(user.uid);
    });

    absenceBtn.addEventListener("click", async () => {
        await reportAbsenceModal(user.uid);
        await updateCheckInState(user.uid);
    });

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("userData");
        signOut(auth);
    });

    monthSelect.addEventListener("change", async () => {
        loader.classList.remove("hidden");
        const selectedMonth = monthSelect.value;
        currentMonthLabel.textContent = selectedMonth;
        await loadAttendance(user.uid, selectedMonth);
        await markApprovedVacationsOnCalendar();
        loader.classList.add("hidden");
    });
    loader.classList.add("hidden");
});