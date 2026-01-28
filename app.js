const LIFF_ID = "2008976552-16c2pVFX";
const API_URL = "https://script.google.com/macros/s/AKfycbzuyLi5t0kb7PufrNYZ0x8stOf0j3T2u9XH7Si1hB3wvqEZ39m0vwNczYGCMcH7ayzyiQ/exec"; // <- ใส่ลิงก์ /exec

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let DATA = [];
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
🕒 ${item.date} ${(item.time || "-")}
${renderLocationLine(item.location)}
👤 ${item.artist_display || item.artists}`.trim()
  }]);
}

async function fetchSchedule() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error("API error: " + res.status);
  const raw = await res.json();

  // ปรับให้สะอาด พร้อมใช้กับ UI
  DATA = raw.map(x => ({
    id: x.id,
    date: normalizeDate(x.date),
    time: normalizeTime(x.time),
    title: String(x.title || "").trim(),
    location: String(x.location || "").trim(),
    type: String(x.type || "").trim(),
    artists: String(x.artists || "").trim(),
    artist_display: String(x.artist_display || "").trim(),
  })).filter(x => x.date);
}

function filterMonthData(ym, artist) {
  return DATA.filter(x => {
    if (!x.date.startsWith(ym)) return false;
    if (artist === "ALL") return true;
    return parseArtists(x.artists).includes(artist);
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
    const tags = parseArtists(item.artists).map(a => `<span class="tag">${a}</span>`).join(" ");
    const calLink = googleCalLink(item);

    box.innerHTML += `
      <div class="card">
        <div class="small">${(item.time || "-")}</div>
        <div class="title">${item.title}</div>
        <div class="small">${renderLocationLine(item.location)}</div>

        ${item.artist_display ? `<div class="small">👤 ${item.artist_display}</div>` : ""}
        <div class="tags">${tags}</div>

        <div class="btns">
          <button onclick='window.__share(${JSON.stringify(item).replaceAll("'","\\'")})'>Share</button>
          <a class="btn" href="${calLink}" target="_blank" rel="noreferrer">Add to Calendar</a>
        </div>
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

// ===== helper functions =====
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
  mp.value = ymFromISO(isoToday());

  const af = document.getElementById("artistFilter");
  af.innerHTML = uniqArtists(DATA).map(a => `<option value="${a}">${a}</option>`).join("");

  window.__share = share;

  mp.addEventListener("change", () => { selectedDateISO = null; renderAll(); });
  af.addEventListener("change", () => { selectedDateISO = null; renderAll(); });

  renderAll();
}


main().catch(err => {
  document.getElementById("welcome").textContent = `Error: ${err.message}`;
  console.error(err);
});
