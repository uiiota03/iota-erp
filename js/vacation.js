import { db } from "./firebase-config.js";
import { collection, addDoc, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const auth = getAuth();
let currentUser = null;

onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        await loadVacationRequests();
    }
});

const form = document.getElementById("vacationForm");
const message = document.getElementById("vacationMessage");
const tableBody = document.getElementById("vacationTableBody");

form.addEventListener("submit", async e => {
    e.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const position = document.getElementById("position").value.trim();
    const purpose = document.getElementById("purpose").value.trim();
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;

    if (!fullName || !position || !purpose || !startDate || !endDate) {
        message.textContent = "Please fill all fields.";
        message.classList.replace("text-green-600", "text-red-600");
        return;
    }

    try {
        await addDoc(collection(db, "vacationRequests"), {
            uid: currentUser.uid,
            fullName,
            position,
            purpose,
            startDate,
            endDate,
            status: "Pending",
            createdAt: serverTimestamp(), // bu yer muhim!
        });

        message.textContent = "Request submitted successfully.";
        message.classList.replace("text-red-600", "text-green-600");
        form.reset();
        await loadVacationRequests();
    } catch (error) {
        console.error("Error submitting vacation request:", error);
        message.textContent = "Error submitting request.";
        message.classList.replace("text-green-600", "text-red-600");
    }
});

async function loadVacationRequests() {
    tableBody.innerHTML = "";
    const q = query(collection(db, "vacationRequests"), where("uid", "==", currentUser.uid));
    const snapshot = await getDocs(q);

    snapshot.forEach(doc => {
        const data = doc.data();
        const row = document.createElement("tr");

        row.innerHTML = `
      <td class="border p-2">${data.createdAt?.toDate().toLocaleDateString() || "-"}</td>
      <td class="border p-2">${data.purpose}</td>
      <td class="border p-2">${data.startDate} - ${data.endDate}</td>
      <td class="border p-2">${data.status}</td>
      <td class="border p-2">
        <button onclick='showModal(${JSON.stringify(data)})'
          class="text-blue-600 underline hover:text-blue-800">Ko‘rish</button>
      </td>
    `;
        tableBody.appendChild(row);
    });
}

window.showModal = function (data) {
    let createdAtText = "-";

    if (data.createdAt) {
        if (typeof data.createdAt.toDate === "function") {
            createdAtText = data.createdAt.toDate().toLocaleDateString();
        } else if (typeof data.createdAt === "string") {
            const d = new Date(data.createdAt);
            if (!isNaN(d)) createdAtText = d.toLocaleDateString();
        }
    }

    const content = `
I, ${data.fullName}, working as a ${data.position},
hereby request a vacation leave for the purpose of:

"${data.purpose}"

Leave duration:
From ${data.startDate} to ${data.endDate}.

Application status: ${data.status}.
Requested on: ${createdAtText}
  `;

    document.getElementById("modalContent").textContent = content;
    document.getElementById("viewModal").classList.remove("hidden");
};

window.closeModal = function () {
  document.getElementById("viewModal").classList.add("hidden");
};



