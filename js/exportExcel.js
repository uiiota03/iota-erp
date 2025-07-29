import { writeFile, utils } from "https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs";

function formatMonth(date) {
    const months = [
        "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
        "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function parseAttendance(value) {
    if (!value || typeof value !== "string") return { status: "-", checkIn: null, extraHours: null, leaveTime: null };
    const parts = value.split("@");
    if (parts[0] === "O") {
        return {
            status: "+", // Overtime kelgan sifatida ko'rsatiladi
            checkIn: parts[1] || null,
            extraHours: parts[2] ? Number(parts[2]) : 0,
            leaveTime: null
        };
    } else if (parts[0] === "E") {
        return {
            status: "+", // Erta chiqish kelgan sifatida ko'rsatiladi
            checkIn: null,
            extraHours: null,
            leaveTime: parts[1] || null
        };
    } else if (parts[0] === "V") {
        return {
            status: "V", // Ta'til
            checkIn: null,
            extraHours: null,
            leaveTime: null
        };
    }
    return {
        status: parts[0] || "-",
        checkIn: parts[1] || null,
        extraHours: null,
        leaveTime: null
    };
}

function calculateWorkedHours(attendance, year, month, day) {
    const { status, checkIn, extraHours, leaveTime } = attendance;
    if (status !== "+" || (!checkIn && !leaveTime)) return 0;

    let hoursWorked = 0;
    if (checkIn) {
        const [hours, minutes] = checkIn.split(":").map(Number);
        const checkInTime = new Date(year, month - 1, day, hours, minutes);
        const eightTen = new Date(year, month - 1, day, 8, 10);
        const endOfDay = new Date(year, month - 1, day, 17, 0);

        if (checkInTime <= eightTen) {
            hoursWorked = 8; // 08:10 dan oldin kelgan bo'lsa, 8 soat
        } else {
            const diffMs = endOfDay - checkInTime;
            hoursWorked = Math.max(0, diffMs / (1000 * 60 * 60)); // Kirishdan 17:00 gacha
        }

        if (extraHours) {
            hoursWorked += extraHours; // Overtime soatlarni qo'shish
        }
    } else if (leaveTime) {
        const [hours, minutes] = leaveTime.split(":").map(Number);
        const leaveTimeDate = new Date(year, month - 1, day, hours, minutes);
        const startOfDay = new Date(year, month - 1, day, 8, 0);
        const diffMs = leaveTimeDate - startOfDay;
        hoursWorked = Math.max(0, diffMs / (1000 * 60 * 60)); // 08:00 dan chiqish vaqtigacha
    }

    return +hoursWorked.toFixed(2); // 2 xonagacha yaxlitlash
}

// Statik bayram kunlari ro'yxati (O'zbekiston bayramlari)
const holidays = {
    "2025-01-01": "Yangi Yil",
    "2025-03-08": "Xalqaro Xotin-Qizlar Kuni",
    "2025-03-21": "Navro'z",
    "2025-05-09": "Xotira va Qadrlash Kuni",
    "2025-09-01": "Mustaqillik Kuni",
    "2025-10-01": "O'qituvchilar Kuni",
    "2025-12-08": "Konstitutsiya Kuni"
};

export async function exportAttendanceToExcel(monthStr, employeesObj, attendanceData) {
    if (!employeesObj || typeof employeesObj !== 'object') return;

    const employees = Object.values(employeesObj);
    employees.sort((a, b) => a.position?.localeCompare(b.position) || 0);

    const wb = utils.book_new();
    const wsData = [];

    const [year, month] = monthStr.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const formattedMonth = formatMonth(new Date(`${monthStr}-01`));

    // Header part
    wsData.push([`Tabel jadvali – ${formattedMonth}`]);
    wsData.push(["Korxona: ________________"]);
    wsData.push(["Bo‘lim: ________________"]);
    wsData.push([""]);

    const headers = ["#", "Ismi", "Familiyasi", "Lavozimi"];
    for (let d = 1; d <= daysInMonth; d++) headers.push(d.toString());
    headers.push("Kelgan kunlar", "Umumiy soat");
    wsData.push(headers);

    const positionOrder = {
        "direktor": 1,
        "boshliq": 2,
        "muhandis": 3,
        "ishchi": 4
    };

    employees.sort((a, b) => {
        const posA = positionOrder[a.position?.toLowerCase()] || 99;
        const posB = positionOrder[b.position?.toLowerCase()] || 99;
        return posA - posB;
    });

    employees.forEach((emp, index) => {
        if ((emp.role || "").toLowerCase() === "admin") return;

        const row = [index + 1, emp.firstName, emp.lastName, emp.position];
        let totalDays = 0;
        let totalHours = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const dayStr = `${monthStr}-${d.toString().padStart(2, "0")}`;
            const raw = attendanceData?.[emp.uid]?.[dayStr] || "";
            const attendance = parseAttendance(raw);
            const hoursWorked = calculateWorkedHours(attendance, year, month, d);
            const date = new Date(year, month - 1, d);
            const isWeekend = [0, 6].includes(date.getDay());
            const isHoliday = holidays[dayStr];

            if (attendance.status === "+" && hoursWorked > 0) {
                totalDays++;
                totalHours += hoursWorked;
                row.push(hoursWorked);
            } else if (attendance.status === "V") {
                row.push("V"); // Ta'til
            } else if (isWeekend) {
                row.push("W"); // Dam olish kuni
            } else if (isHoliday) {
                row.push("B"); // Bayram kuni
            } else {
                row.push("-"); // Kelmagan
            }
        }

        row.push(totalDays, +totalHours.toFixed(2));
        wsData.push(row);
    });

    wsData.push([]);
    wsData.push(["Tabel tuzuvchi: _____________________", "", "", "Direktor: _____________________"]);
    wsData.push(["Sana: " + new Date().toLocaleDateString("uz-UZ")]);

    const ws = utils.aoa_to_sheet(wsData);

    const range = utils.decode_range(ws["!ref"]);
    for (let R = 4; R <= range.e.r - 3; R++) {
        for (let C = 4; C < 4 + daysInMonth; C++) {
            const cellAddr = utils.encode_cell({ r: R, c: C });
            const cell = ws[cellAddr];
            if (!cell) continue;

            const day = C - 3;
            const dateStr = `${monthStr}-${day.toString().padStart(2, "0")}`;
            const date = new Date(dateStr);
            const isWeekend = [0, 6].includes(date.getDay());
            const isHoliday = holidays[dateStr];
            const raw = attendanceData?.[employees[R - 4]?.uid]?.[dateStr] || "";
            const attendance = parseAttendance(raw);

            cell.s = {
                fill: {
                    fgColor: {
                        rgb: isHoliday
                            ? "FFD700" // Sariq rang bayram kunlari uchun
                            : attendance.status === "V"
                                ? "FFD700" // Ta'til
                                : attendance.status === "+" && attendance.extraHours
                                    ? "ADD8E6" // Ko'k rang overtime uchun
                                    : attendance.status === "+" && attendance.leaveTime
                                        ? "FED7AA" // Sariq rang erta chiqish uchun
                                        : attendance.status === "+" && !isWeekend
                                            ? "90EE90" // Yashil rang oddiy kelish uchun
                                            : isWeekend
                                                ? "D3D3D3" // Kulrang dam olish kunlari uchun
                                                : "FF7F7F" // Qizil kelmagan kunlar uchun
                    }
                },
                alignment: { horizontal: "center" },
                numFmt: attendance.status === "V" ? "" : "0.00"
            };
        }
    }

    // Set column widths
    ws["!cols"] = headers.map((_, i) => ({ wch: i < 4 ? 15 : 7 }));

    utils.book_append_sheet(wb, ws, formattedMonth);
    await writeFile(wb, `Tabel_${formattedMonth.replace(" ", "_")}.xlsx`);
}