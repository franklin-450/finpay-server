// ==========================
// Session & Authentication
// ==========================
const API_BASE = 'https://localhost:3000';
const token = localStorage.getItem('token');
let lastActivityTime = Date.now();

// Start session
function startSession() {
    const startTime = new Date().toISOString();
    localStorage.setItem('sessionStart', startTime);

    // Send to backend
    fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: localStorage.getItem('userId'),
            startTime
        })
    }).catch(err => console.error('Session start error:', err));
}

// End session
function endSession() {
    const endTime = new Date().toISOString();
    const startTime = localStorage.getItem('sessionStart');

    // Send to backend
    fetch('/api/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: localStorage.getItem('userId'),
            startTime,
            endTime
        })
    }).catch(err => console.error('Session end error:', err));

    // Clear session
    localStorage.removeItem('sessionStart');
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
}

// ==========================
// Inactivity auto-logout
// ==========================
const inactivityLimit = 5 * 60 * 1000; // 5 minutes

function resetActivity() {
    lastActivityTime = Date.now();
}
window.addEventListener("mousemove", resetActivity);
window.addEventListener("keypress", resetActivity);
window.addEventListener("click", resetActivity);
window.addEventListener("scroll", resetActivity);
window.addEventListener("touchstart", resetActivity);

setInterval(() => {
    if (Date.now() - lastActivityTime > inactivityLimit) {
        alert("Session timed out due to inactivity. Please re-enter your account number and password.");
        window.location.href = "reauth.html"; // Re-authentication page
    }
}, 1000);

// ==========================
// Login Expiry (2 days)
// ==========================
const loginTimeKey = "loginTime";
const loginDuration = 2 * 24 * 60 * 60 * 1000; // 2 days

function checkLoginExpiry() {
    // ❌ FIX: should read, not set
    const loginTime = localStorage.getItem(loginTimeKey);
    if (loginTime && Date.now() - parseInt(loginTime) > loginDuration) {
        localStorage.clear();
        alert("Your login has expired. Please log in again.");
        window.location.href = "login.html";
    }
}
checkLoginExpiry();

function saveLoginTime() {
    localStorage.setItem(loginTimeKey, Date.now().toString());
}

// ==========================
// Main App IIFE
// ==========================
(function () {
    const $ = (id) => document.getElementById(id);

    // Replace feather icons after DOM loads
    document.addEventListener("DOMContentLoaded", () => {
        if (window.feather) feather.replace();
    });

    // ---------------------------
    // Settings Modal
    // ---------------------------
    window.openSettingsModal = function openSettingsModal() {
        const overlay = $("modalOverlay");
        const modal = $("settingsModal");
        if (!overlay || !modal) return;
        overlay.style.display = "block";
        modal.style.display = "block";
        window.showSection("account");
    };

    window.closeSettingsModal = function closeSettingsModal() {
        const overlay = $("modalOverlay");
        const modal = $("settingsModal");
        if (!overlay || !modal) return;
        overlay.style.display = "none";
        modal.style.display = "none";
    };

    // Switch settings section
    window.showSection = function showSection(name) {
        document.querySelectorAll(".settings-section").forEach(s => s.style.display = "none");
        const el = $("sec-" + name);
        if (el) el.style.display = "block";
        document.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
        const tab = document.querySelector('.settings-tab[data-section="' + name + '"]');
        if (tab) tab.classList.add("active");
        const title = $("settingsTitle");
        if (title) title.innerText = tab ? tab.textContent.trim() : "Settings";
    };

    // ---------------------------
    // Sidebar navigation switching
    // ---------------------------
    window.switchView = function switchView(view, el, event) {
        if (event) event.preventDefault(); // stop unwanted reload
        // clear active class
        document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
        // set active on clicked
        if (el) el.classList.add("active");
        // hide all views
        document.querySelectorAll("#views .view").forEach(v => v.style.display = "none");
        // show selected view
        const viewEl = $("view-" + view);
        if (viewEl) viewEl.style.display = "";
    };

    // ---------------------------
    // User Data handling
    // ---------------------------
    function getLocalUser() {
        try { return JSON.parse(localStorage.getItem("user") || "{}"); }
        catch { return {}; }
    }

    function saveLocalUser(u) {
        localStorage.setItem("user", JSON.stringify(u || {}));
    }

    function decodeJwtId(token) {
        try {
            const payload = JSON.parse(atob(token.split(".")[1]));
            return payload?.id;
        } catch { return null; }
    }

    async function populateUserFields() {
        const user = getLocalUser();
        // fill profile fields safely
        const setVal = (id, value) => { const el = $(id); if (el) el.value = value ?? ""; };
        const setText = (id, value) => { const el = $(id); if (el) el.textContent = value ?? ""; };

        setText("userid", user.id ? `No: ${user.id}` : "");
        setText("userName", `Name: ${(user.firstName || "")} ${(user.lastName || "")}`.trim());
        setText("userEmail", user.email ? `Email: ${user.email}` : "");

        setVal("editFirstName", user.firstName);
        setVal("editLastName", user.lastName);
        setVal("editEmail", user.email);
        setVal("editPhoneNo", user.phoneNo);
        setVal("editIdNo", user.idNo);
        setVal("editAcc", user.accountNo);
        setVal("editPassword", user.plaintextPassword || user.password);

        // theme
        const savedTheme = localStorage.getItem("theme") || "light";
        document.documentElement.setAttribute("data-theme", savedTheme);
        const themeToggle = $("themeToggle");
        if (themeToggle) themeToggle.checked = savedTheme === "dark";
    }

    // ---------------------------
    // Save Profile
    // ---------------------------
    async function saveUserSettings() {
        const user = getLocalUser();
        const token = localStorage.getItem("token") || "";
        const id = user?.id || decodeJwtId(token);

        const updated = {
            firstName: $("editFirstName")?.value?.trim(),
            lastName: $("editLastName")?.value?.trim(),
            email: $("editEmail")?.value?.trim(),
            phoneNo: $("editPhoneNo")?.value?.trim(),
            idNo: $("editIdNo")?.value?.trim(),
            accountNo: $("editAcc")?.value?.trim(),
            password: $("editPassword")?.value || ""
        };

        // local save
        const merged = { ...user, ...updated, plaintextPassword: updated.password };
        saveLocalUser(merged);

        // server save
        if (id && token) {
            try {
                const res = await fetch(`http://localhost:3000/api/users/${encodeURIComponent(id)}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify(updated)
                });
                const data = await res.json();
                if (!res.ok || data?.success === false) {
                    alert(data?.message || "Failed to update profile on server.");
                } else {
                    alert("Settings saved successfully!");
                }
            } catch (e) {
                alert("Network error while saving settings.");
            }
        } else {
            alert("Saved locally. (Missing token or user id for server update)");
        }
        window.closeSettingsModal();
    }

    // ---------------------------
    // Topbar Popups (notif/profile)
    // ---------------------------
    function ensurePopup(id, cssText) {
        let el = $(id);
        if (!el) {
            el = document.createElement("div");
            el.id = id;
            el.style.cssText = cssText;
            document.body.appendChild(el);
        }
        return el;
    }

    function attachTopbarPopups() {
        const notifBtn = $("notifBtn");
        const profileBtn = $("profileBtn");

        const popupBase =
            "position:absolute;top:60px;right:20px;background:var(--card);padding:15px;border-radius:10px;" +
            "box-shadow:0 8px 24px rgba(0,0,0,0.15);display:none;width:260px;z-index:999;";

        const notifPopup = ensurePopup("notifPopup", popupBase);
        const profilePopup = ensurePopup("profilePopup", popupBase);

        function renderProfilePopup() {
            const u = getLocalUser();
            const initials = ((u.firstName?.[0] || "") + (u.lastName?.[0] || "")).toUpperCase() || "U";
            profilePopup.innerHTML = `
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <div style="width:40px;height:40px;border-radius:50%;background:#007bff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${initials}</div>
                <div>
                  <div style="font-weight:700">${(u.firstName||"") + " " + (u.lastName||"")}</div>
                  <div style="font-size:12px;color:000">${u.accountNo  ||  ""}</div>
                  <div style="font-size:12px;color:var(--muted)">${u.email || ""}</div>
                </div>
              </div>
              <button class="btn primary" style="width:100%;margin-top:6px" onclick="openSettingsModal()">Settings</button>
            `;
        }
        renderProfilePopup();

        notifPopup.innerHTML = `<div style="font-weight:700;margin-bottom:8px">Notifications</div>
            <div style="color:var(--muted);font-size:13px">You're all caught up 🎉</div>`;

        notifBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            notifPopup.style.display = notifPopup.style.display === "block" ? "none" : "block";
            profilePopup.style.display = "none";
        });

        profileBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            renderProfilePopup();
            profilePopup.style.display = profilePopup.style.display === "block" ? "none" : "block";
            notifPopup.style.display = "none";
        });

        document.addEventListener("click", (e) => {
            if (!notifPopup.contains(e.target) && e.target !== notifBtn) notifPopup.style.display = "none";
            if (!profilePopup.contains(e.target) && e.target !== profileBtn) profilePopup.style.display = "none";
        });
    }

    // ---------------------------
    // Theme toggle
    // ---------------------------
    function attachThemeToggle() {
        const themeToggle = $("themeToggle");
        if (!themeToggle) return;
        themeToggle.addEventListener("change", function () {
            const next = this.checked ? "dark" : "light";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem("theme", next);
        });
    }

    // ---------------------------
    // Settings tabs
    // ---------------------------
    function attachSettingsTabs() {
        document.querySelectorAll(".settings-tab").forEach(t => {
            t.addEventListener("click", () => window.showSection(t.dataset.section));
        });
        const overlay = $("modalOverlay");
        overlay?.addEventListener("click", (e) => {
            if (e.target === overlay) window.closeSettingsModal();
        });
        window.showSection("account");
    }

    // ---------------------------
    // Save button
    // ---------------------------
    function attachSaveBtn() {
        const saveBtn = $("saveProfileBtn");
        saveBtn?.addEventListener("click", saveUserSettings);
    }

    // ---------------------------
    // INIT
    // ---------------------------
    document.addEventListener("DOMContentLoaded", () => {
        populateUserFields();
        attachThemeToggle();
        attachSettingsTabs();
        attachTopbarPopups();
        attachSaveBtn();

        // ✅ FIX: set dashboard as default active
        const firstNav = document.querySelector(".nav-item[data-target='dashboard']");
        window.switchView("dashboard", firstNav);
    });

})();

// ==========================
// Logout
// ==========================
function logoutUser() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('loginTimestamp');

    fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: localStorage.getItem('authToken') })
    }).catch(err => console.error('Logout API error:', err));

    window.location.href = 'end.html';
}
document.getElementById('logoutBtn').addEventListener('click', logoutUser);

// ==========================
// Card Alert with Blur
// ==========================
function showCardAlert(message, type = "info") {
    let alert = document.createElement("div");
    alert.className = "card-alert " + type;
    alert.innerHTML = `
      <div style="backdrop-filter:blur(6px);background:rgba(255,255,255,0.85);
                  border-radius:12px;padding:16px;box-shadow:0 8px 20px rgba(0,0,0,0.2);
                  max-width:320px;text-align:center;font-weight:600;">
        <i data-feather="credit-card"></i> ${message}
      </div>
    `;
    document.body.appendChild(alert);
    feather.replace({ 'width': 20, 'height': 20 });

    // Auto remove after 3s
    setTimeout(() => {
        alert.style.opacity = "0";
        setTimeout(() => alert.remove(), 400);
    }, 3000);
}
