import { writeFile, utils } from "https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs";

function formatMonth(date) {
    const months = [
        "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
        "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function parseAttendance(value) {
    if (!value || typeof value !== "string") return { status: "-", checkIn: null };
    const [status, checkIn] = value.split("@");
    return {
        status: status || "-",
        checkIn: checkIn || null
    };
}

function calculateWorkedHours(checkInStr) {
    if (!checkInStr) return 0;
    const [hours, minutes] = checkInStr.split(":").map(Number);
    const checkInTime = new Date();
    checkInTime.setHours(hours, minutes, 0, 0);

    const endTime = new Date();
    endTime.setHours(17, 0, 0, 0); // 17:00 is end of workday

    const diffMs = endTime - checkInTime;
    if (diffMs <= 0) return 0;

    return +(diffMs / (1000 * 60 * 60)).toFixed(2); // round to 2 decimals
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
    employees.sort((a, b) => a.position.localeCompare(b.position));

    const wb = utils.book_new();
    const wsData = [];

    const [year, month] = monthStr.split("-");
    const daysInMonth = new Date(+year, +month, 0).getDate();
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
            const { status, checkIn } = parseAttendance(raw);

            let hoursWorked = 0;
            if (status === "+" && checkIn) {
                hoursWorked = calculateWorkedHours(checkIn);
                totalDays++;
                totalHours += hoursWorked;
                row.push(hoursWorked);
            } else {
                row.push(0); // Mark as absent or undefined
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
            const val = parseFloat(cell.v);

            cell.s = {
                fill: {
                    fgColor: {
                        rgb: isHoliday
                            ? "FFD700" // Sariq rang bayram kunlari uchun
                            : val > 0
                                ? (isWeekend ? "ADD8E6" : "90EE90") // blue / green
                                : (isWeekend ? "FFC0CB" : "FF7F7F") // pink / red
                    }
                },
                alignment: { horizontal: "center" },
                numFmt: "0.00"
            };
        }
    }

    // Set column widths
    ws["!cols"] = headers.map((_, i) => ({ wch: i < 4 ? 15 : 7 }));

    utils.book_append_sheet(wb, ws, formattedMonth);
    await writeFile(wb, `Tabel_${formattedMonth.replace(" ", "_")}.xlsx`);
}