const LIFF_ID = "2008976552-16c2pVFX";
const API_URL = "https://script.google.com/macros/s/AKfycbzuyLi5t0kb7PufrNYZ0x8stOf0j3T2u9XH7Si1hB3wvqEZ39m0vwNczYGCMcH7ayzyiQ/exec"; // <- ใส่ลิงก์ /exec

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let DATA = [];
let ARTISTS = [];
let ARTIST_MAP = new Map();
let selectedDateISO = null; // YYYY-MM-DD

function isoToday() {
  const d = new Date();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function ymFromISO(iso) { return iso.slice(0,7); }
function firstOfMonthISO(ym) { return `${ym}-01`; }

function parseArtists(str) {
  return String(str || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function uniqArtists(data) {
  const set = new Set();
  data.forEach(x => parseArtists(x.artists).forEach(a => set.add(a)));
  return ["ALL", ...Array.from(set).sort()];
}

function avatarUrlFor(name, imageUrl) {
  const url = String(imageUrl || "").trim();
  if (url) return url;

  const letter = (name || "?").trim().slice(0, 1).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
      <rect width="100%" height="100%" rx="48" ry="48" fill="#E5E7EB"/>
      <text x="50%" y="55%" text-anchor="middle" font-size="42"
            font-family="system-ui, -apple-system, Segoe UI"
            fill="#111">${letter}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function igLink(handle) {
  const h = String(handle || "").trim().replace(/^@/, "");
  if (!h) return "";
  return `https://instagram.com/${encodeURIComponent(h)}`;
}

function accentFromName(name) {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    bg: `hsl(${hue} 70% 92%)`,
    fg: `hsl(${hue} 70% 28%)`,
    border: `hsl(${hue} 70% 70%)`
  };
}

function buildArtistDisplay(artistIdsCSV) {
  const ids = parseArtists(artistIdsCSV);
  return ids.map(id => (ARTIST_MAP.get(id)?.name || id)).join(", ");
}


// แปลง date จาก API ให้เหลือ YYYY-MM-DD
function normalizeDate(val) {
  const s = String(val || "").trim();
  if (!s) return "";
  // ถ้าเป็น ISO: 2026-01-16T17:00:00.000Z
  if (s.includes("T")) return s.slice(0,10);
  // ถ้าเป็น YYYY-MM-DD อยู่แล้ว
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

// แปลง time จาก API ให้เป็น HH:mm หรือ All Day
function normalizeTime(val) {
  const s = String(val || "").trim();
  if (!s) return "";
  if (s.toLowerCase().includes("all day")) return "All Day";
  // ดึง HH:MM จากข้อความยาว เช่น Sat Dec 30 1899 13:00:00 GMT+...
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2,"0")}:${m[2]}`;
  // เผื่อคนกรอก 8.30 AM
  const m2 = s.match(/(\d{1,2})\.(\d{2})\s*(AM|PM)/i);
  if (m2) {
    let hh = parseInt(m2[1],10);
    const mm = m2[2];
    const ap = m2[3].toUpperCase();
    if (ap === "PM" && hh !== 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;
    return `${String(hh).padStart(2,"0")}:${mm}`;
  }
  return s;
}

function isPrivateLocation(location) {
  const s = String(location || "").toLowerCase();
  return s.includes("เฉพาะผู้มีสิทธิ์") || s.includes("private") || s.includes("เฉพาะผู้ได้รับเชิญ");
}

function isLiveLocation(location) {
  const s = String(location || "").toLowerCase();
  const keys = ["facebook","youtube","tiktok","live","line man","line live"];
  return keys.some(k => s.includes(k));
}

function renderLocationLine(location) {
  if (!location) return "";
  if (isPrivateLocation(location)) return "🔒 เฉพาะผู้มีสิทธิ์เข้าร่วมงาน";
  if (isLiveLocation(location)) return `📺 ${location}`;
  return `📍 ${location}`;
}

function isCheerType(type){
  return /ให้กำลังใจ|เชียร์|รอบงาน/i.test(String(type||""));
}

function renderTypeText(type) {
  const t = String(type || "").trim();
  if (!t) return "";

  const isPrivate = /เฉพาะผู้มีสิทธิ์|private|เฉพาะผู้ได้รับเชิญ/i.test(t);
  const isCheer = /ให้กำลังใจ|เชียร์|รอบงาน/i.test(t);
  const isLive = /live|ไลฟ์|facebook|youtube|tiktok/i.test(t);

  const icon = isPrivate ? "🔒" : isCheer ? "💖" : isLive ? "📺" : "✨";
  return `<div class="type-text">${icon} ${escapeHtml(t)}</div>`;
}


function fmtTime(t) {
  return (t === "All Day") ? "All Day" : (t || "-");
}

function googleCalLink(item) {
  // แบบง่าย: สร้าง event ใน Google Calendar (เหมาะพอร์ต)
  const text = encodeURIComponent(`${item.artist_display || item.artists}: ${item.title}`);
  const details = encodeURIComponent(`${item.location || ""}`);
  const d = item.date.replaceAll("-","");
  const t = (item.time && item.time !== "All Day") ? item.time.replace(":","") + "00" : "000000";
  const dates = encodeURIComponent(`${d}T${t}/${d}T${t}`);
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&details=${details}&dates=${dates}`;
}

async function share(item) {
  if (!liff.isApiAvailable("shareTargetPicker")) {
    alert("shareTargetPicker not available");
    return;
  }
  await liff.shareTargetPicker([{
    type: "text",
    text:
`📅 ${item.title}
🕒 ${item.date} ${fmtTime(item.time)}
${renderLocationLine(item.location)}
👤 ${item.artist_display || item.artists}`.trim()
  }]);
}

async function fetchSchedule() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error("API error: " + res.status);

  const payload = await res.json();
  const rawEvents = Array.isArray(payload) ? payload : (payload.events || []);
  const rawArtists = Array.isArray(payload) ? [] : (payload.artists || []);

  // artists master
  ARTISTS = rawArtists.map(a => ({
    artist_id: String(a.artist_id || "").trim(),
    name: String(a.name || "").trim(),
    ig: String(a.ig || "").trim().replace(/^@/, ""),
    img_url: String(a.img_url || "").trim(),
  })).filter(a => a.artist_id);

  ARTIST_MAP = new Map(ARTISTS.map(a => [a.artist_id, a]));

  // events
  DATA = rawEvents.map(x => ({
    id: x.id,
    date: normalizeDate(x.date),
    time: normalizeTime(x.time),
    title: String(x.title || "").trim(),
    location: String(x.location || "").trim(),
    type: String(x.type || "").trim(),
    artists: String(x.artists || "").trim(),
    artist_display: String(x.artist_display || "").trim() || buildArtistDisplay(x.artists),
  })).filter(x => x.date);
}

function filterMonthData(ym, artist) {
  return DATA.filter(x => {
    if (!x.date.startsWith(ym)) return false;

    // artist filter
    if (artist !== "ALL" && !parseArtists(x.artists).includes(artist)) return false;
    return true;
  });
}


function countByDate(list) {
  const map = new Map();
  list.forEach(x => map.set(x.date, (map.get(x.date)||0)+1));
  return map;
}

function buildCalendar(ym, monthData) {
  const cal = document.getElementById("calendar");
  cal.innerHTML = "";

  // DOW header
  DOW.forEach(d => {
    const el = document.createElement("div");
    el.className = "dow";
    el.textContent = d;
    cal.appendChild(el);
  });

  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m-1, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const prevMonthLast = new Date(y, m-1, 0).getDate();

  const counts = countByDate(monthData);

  function cell(iso, dayNum, muted=false) {
    const c = document.createElement("div");
    c.className = "day" + (muted ? " muted" : "") + (iso === selectedDateISO ? " selected" : "");
    c.innerHTML = `<div>${dayNum}</div>`;

    if (!muted) {
      const n = counts.get(iso) || 0;
      if (n > 0) {
        const b = document.createElement("div");
        b.className = "badge";
        b.textContent = n;
        c.appendChild(b);
      }
      c.addEventListener("click", () => {
        selectedDateISO = iso;
        renderAll();
      });
    }
    cal.appendChild(c);
  }

  // prev padding
  for (let i=startDow; i>0; i--) {
    cell("MUTED", prevMonthLast - i + 1, true);
  }
  // month days
  for (let d=1; d<=daysInMonth; d++) {
    const iso = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    cell(iso, d, false);
  }
}


function renderArtistPills(artistIdsCSV) {
  const ids = parseArtists(artistIdsCSV);
  if (!ids.length) return "";

  return `
    <div class="pills">
      ${ids.map(id => {
        const a = ARTIST_MAP.get(id) || { artist_id: id, name: id, ig: "", img_url: "" };
        const src = avatarUrlFor(a.name, a.img_url);
        const ac = accentFromName(a.name);
        return `
          <button class="pill-artist" type="button"
            onclick="window.__openArtist('${id}')"
            style="background:${ac.bg}; border-color:${ac.border};">
            <img src="${src}" alt="${a.name}" />
            <span style="color:${ac.fg}">${a.name}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function openArtistModal(artistId) {
  const modal = document.getElementById("artistModal");
  const backdrop = document.getElementById("modalBackdrop");
  const closeBtn = document.getElementById("modalClose");
  const sheet = document.querySelector(".modal-sheet");

  const a = ARTIST_MAP.get(artistId) || { artist_id: artistId, name: artistId, ig: "", img_url: "" };
  const src = avatarUrlFor(a.name, a.img_url);
  const ac = accentFromName(a.name);

  document.getElementById("modalAvatar").src = src;
  document.getElementById("modalTitle").textContent = a.name;
  document.getElementById("modalIG").textContent = a.ig ? `ig: ${a.ig}` : "";

  if (sheet) sheet.style.borderColor = ac.border;

  const igUrl = igLink(a.ig);
  const openBtn = document.getElementById("openIGBtn");
  openBtn.href = igUrl || "#";
  openBtn.style.pointerEvents = igUrl ? "auto" : "none";
  openBtn.style.opacity = igUrl ? "1" : ".45";

  document.getElementById("copyIGBtn").onclick = async () => {
    if (!a.ig) return;
    try { await navigator.clipboard.writeText(a.ig); alert("Copied IG ✅"); }
    catch { alert("Copy not supported"); }
  };

  const close = () => modal.classList.add("hidden");
  closeBtn.onclick = close;
  backdrop.onclick = close;

  modal.classList.remove("hidden");
}

function renderDayList(ym, artist) {
  const monthData = filterMonthData(ym, artist);

  if (!selectedDateISO) {
    const today = isoToday();
    selectedDateISO = today.startsWith(ym) ? today : firstOfMonthISO(ym);
  }

  document.getElementById("selectedDate").textContent = selectedDateISO;

  const list = monthData
    .filter(x => x.date === selectedDateISO)
    .sort((a,b) => {
      // All Day ขึ้นก่อน
      if (a.time === "All Day" && b.time !== "All Day") return -1;
      if (b.time === "All Day" && a.time !== "All Day") return 1;
      return (a.time || "").localeCompare(b.time || "");
    });

  document.getElementById("selectedCount").textContent = `${list.length} events`;

  const box = document.getElementById("scheduleList");
  box.innerHTML = "";

  if (!list.length) {
    box.innerHTML = `<div class="card">No events on this day.</div>`;
    return;
  }

  list.forEach(item => {
    const pills = renderArtistPills(item.artists);

    box.innerHTML += `
      <div class="card">
        <div class="small">${fmtTime(item.time)}</div>
        <div class="title">${item.title}</div>
        <div class="small">${renderLocationLine(item.location)}</div>

        ${item.artist_display ? `<div class="small">👤 ${item.artist_display}</div>` : ""}
        ${renderTypeText(item.type)}
        ${pills}
      </div>
    `;
  });
}

function renderAll() {
  const ym = document.getElementById("monthPicker").value;
  const artist = document.getElementById("artistFilter").value;

  const monthData = filterMonthData(ym, artist);
  buildCalendar(ym, monthData);
  renderDayList(ym, artist);
}


function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===== helper functions =====

async function main() {
  await liff.init({ liffId: LIFF_ID });

  // บังคับให้เปิดใน LINE เท่านั้น
  if (!liff.isInClient()) {
    document.getElementById("welcome").textContent = "Please open this page in LINE (LIFF only).";
    document.getElementById("scheduleList").innerHTML =
      `<div class="card">Open via LIFF link: <br><b>https://liff.line.me/${LIFF_ID}</b></div>`;
    return;
  }

  // อยู่ใน LINE แล้วค่อย login
  if (!liff.isLoggedIn()) {
    liff.login();
    return;
  }

  const profile = await liff.getProfile();
  document.getElementById("welcome").textContent = `Hi ${profile.displayName} 👋`;

  await fetchSchedule();

  const mp = document.getElementById("monthPicker");
  // ตั้งเดือนเริ่มต้นให้เป็นเดือนที่มีข้อมูล (กันเคสจอโล่ง)
  const todayYm = ymFromISO(isoToday());
  const dataYm = (DATA && DATA.length && DATA[0].date) ? ymFromISO(DATA[0].date) : todayYm;
  const hasToday = DATA.some(e => (e.date || "").startsWith(todayYm));
  mp.value = hasToday ? todayYm : dataYm;
  const af = document.getElementById("artistFilter");
  if (ARTISTS.length) {
    af.innerHTML = [`<option value="ALL">ALL</option>`, ...ARTISTS.map(a => `<option value="${a.artist_id}">${a.name}</option>`)].join("");
  af.value = "ALL";
  } else {
    af.innerHTML = uniqArtists(DATA).map(a => `<option value="${a}">${a}</option>`).join("");
  af.value = "ALL";
  }

  window.__openArtist = openArtistModal;

  mp.addEventListener("change", () => { selectedDateISO = null; renderAll(); });
  af.addEventListener("change", () => { selectedDateISO = null; renderAll(); });

  // ✅ แสดงปฏิทิน + รายการทันทีตั้งแต่เปิดหน้า
  selectedDateISO = null;
  renderAll();
}


main().catch(err => {
  document.getElementById("welcome").textContent = `Error: ${err.message}`;
  console.error(err);
});
