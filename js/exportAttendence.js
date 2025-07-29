// Bayram kunlari ro'yxati
const holidays = {
    "2025-01-01": "Yangi Yil",
    "2025-03-08": "Xalqaro Xotin-Qizlar Kuni",
    "2025-03-21": "Navro'z",
    "2025-05-09": "Xotira va Qadrlash Kuni",
    "2025-09-01": "Mustaqillik Kuni",
    "2025-10-01": "O'qituvchilar Kuni",
    "2025-12-08": "Konstitutsiya Kuni"
};

function formatMonth(date) {
    const months = [
        "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
        "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function parseAttendance(value) {
    if (!value || typeof value !== "string") return { status: "-", checkIn: null, extraHours: null };
    const parts = value.split("@");
    if (parts[0] === "O") {
        return {
            status: "+", // Overtime kelgan sifatida ko'rsatiladi
            checkIn: parts[1] || null,
            extraHours: parts[2] ? Number(parts[2]) : 0
        };
    } else if (parts[0] === "E") {
        return {
            status: "+", // Erta chiqish kelgan sifatida ko'rsatiladi
            checkIn: null,
            leaveTime: parts[1] || null
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

    const date = new Date(year, month - 1, day);
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

export function exportAttendanceToHTML(monthStr, employeesObj, attendanceData) {
    if (!employeesObj || typeof employeesObj !== 'object') {
        console.error("❌ Invalid employees object:", employeesObj);
        return;
    }

    const employees = Object.values(employeesObj);
    employees.sort((a, b) => a.position?.localeCompare(b.position) || 0);

    const [year, month] = monthStr.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const formattedMonth = formatMonth(new Date(`${monthStr}-01`));

    // HTML content with Tailwind CSS
    let html = `
        <!DOCTYPE html>
        <html lang="uz">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Tabel Jadvali</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @media print {
                    .bg-yellow-100 { background-color: #fefcbf !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .bg-green-100 { background-color: #d1fae5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .bg-blue-100 { background-color: #bfdbfe !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .bg-orange-100 { background-color: #fed7aa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .bg-red-100 { background-color: #fee2e2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .bg-gray-100 { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body class="font-sans bg-white p-2 print:p-0 text-gray-800">
            <div class="max-w-[1100px] mx-auto">
                <h1 class="text-lg font-semibold text-gray-900 mb-2 print:text-black">Tabel jadvali – ${formattedMonth}</h1>
                <div class="text-sm text-gray-600 mb-1 print:text-black">Korxona: ________________</div>
                <div class="text-sm text-gray-600 mb-4 print:text-black">Bo‘lim: ________________</div>
                <div class="overflow-x-auto">
                    <table class="w-full border-collapse text-xs">
                        <thead>
                            <tr class="bg-gray-100 text-gray-700 font-medium">
                                <th class="border border-gray-200 px-1 py-1 text-center w-8">#</th>
                                <th class="border border-gray-200 px-1 py-1 text-center w-24">Ismi</th>
                                <th class="border border-gray-200 px-1 py-1 text-center w-24">Familiyasi</th>
                                <th class="border border-gray-200 px-1 py-1 text-center w-96">Lavozimi</th>
    `;
    for (let d = 1; d <= daysInMonth; d++) {
        html += `<th class="border border-gray-200 px-1 py-1 text-center w-10">${d}</th>`;
    }
    html += `
                                <th class="border border-gray-200 px-1 py-1 text-center w-16">Kun</th>
                                <th class="border border-gray-200 px-1 py-1 text-center w-16">Soat</th>
                            </tr>
                        </thead>
                        <tbody>
    `;

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

        html += `
            <tr>
                <td class="border border-gray-200 px-1 py-1 text-center">${index + 1}</td>
                <td class="border border-gray-200 px-1 py-1 text-center">${emp.firstName}</td>
                <td class="border border-gray-200 px-1 py-1 text-center">${emp.lastName}</td>
                <td class="border border-gray-200 px-1 py-1 text-center">${emp.position}</td>
        `;
        let totalDays = 0;
        let totalHours = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const dayStr = `${monthStr}-${d.toString().padStart(2, "0")}`;
            const raw = attendanceData?.[emp.uid]?.[dayStr] || "";
            const attendance = parseAttendance(raw);
            const date = new Date(year, month - 1, d);
            const isWeekend = [0, 6].includes(date.getDay());
            const isHoliday = holidays[dayStr];

            let hoursWorked = calculateWorkedHours(attendance, year, month, d);
            let displayValue = "";
            let className = "";

            if (isHoliday) {
                className = "bg-yellow-100";
                displayValue = "B"; // Bayram
            } else if (attendance.status === "V") {
                className = "bg-yellow-100";
                displayValue = "V"; // Ta'til
            } else if (attendance.status === "+" && hoursWorked > 0) {
                totalDays++;
                totalHours += hoursWorked;
                className = attendance.extraHours
                    ? "bg-blue-100" // Overtime
                    : attendance.leaveTime
                        ? "bg-orange-100" // Erta chiqish
                        : isWeekend
                            ? "bg-gray-100"
                            : "bg-green-100"; // Oddiy kelish
                displayValue = hoursWorked.toFixed(2);
            } else {
                className = isWeekend ? "bg-gray-100" : "bg-red-100";
                displayValue = isWeekend ? "" : "0";
            }

            html += `<td class="border border-gray-200 px-1 py-1 text-center ${className}">${displayValue}</td>`;
        }

        html += `
                <td class="border border-gray-200 px-1 py-1 text-center">${totalDays}</td>
                <td class="border border-gray-200 px-1 py-1 text-center">${totalHours.toFixed(2)}</td>
            </tr>
        `;
    });

    html += `
                        </tbody>
                    </table>
                </div>
                <div class="mt-4 text-sm text-gray-600 print:text-black">
                    <p class="mb-1">Tabel tuzuvchi: _____________________ &nbsp;&nbsp;&nbsp;&nbsp; Direktor: _____________________</p>
                    <p>Sana: ${new Date().toLocaleDateString("uz-UZ")}</p>
                </div>
                <button onclick="window.print()" class="mt-3 bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 print:hidden">Chop etish</button>
            </div>
        </body>
        </html>
    `;

    // Yangi oynada ko'rsatish
    const newWindow = window.open("", "_blank");
    newWindow.document.write(html);
    newWindow.document.close();
}