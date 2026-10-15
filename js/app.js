import { ACTIVITIES, CATEGORIES, CONCERNS, MOODS, QUICK_PROMPTS } from "./data.js";
import { store, dateKey } from "./store.js";
import {
  weekStats, todayStats, rollingTotals, comparableTotals, pctChange, recommend, dashboardInsight, progressInsight,
  skillGap, localCoach, askClaude, friendlyError, activitiesMentioned,
} from "./ai.js";

const app = document.getElementById("app");
const nav = document.getElementById("nav");

// ---------- helpers ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const activity = (id) => ACTIVITIES.find((a) => a.id === id);
const mood = (id) => MOODS.find((m) => m.id === id);
const child = () => store.get().profile?.childName || "your child";

function md(text) {
  const lines = esc(text).split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const line = raw
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
    const bullet = line.match(/^\s*(?:•|-|\*|\d+\.)\s+(.*)/);
    if (bullet) {
      if (!inList) html += "<ul>";
      inList = true;
      html += `<li>${bullet[1]}</li>`;
      continue;
    }
    if (inList) html += "</ul>";
    inList = false;
    if (line.trim()) html += `<p>${line}</p>`;
  }
  return html + (inList ? "</ul>" : "");
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function prettyDate(key) {
  const d = new Date(key + "T00:00:00");
  const today = dateKey();
  const yest = dateKey(new Date(Date.now() - 864e5));
  if (key === today) return "Today";
  if (key === yest) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

export function mascot(size = 64) {
  return `<svg class="mascot" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    <defs><linearGradient id="mg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#E7E2FF"/></linearGradient></defs>
    <line x1="60" y1="14" x2="60" y2="26" stroke="#7C4DFF" stroke-width="4" stroke-linecap="round"/>
    <circle cx="60" cy="11" r="6" fill="#7C4DFF"/>
    <rect x="18" y="26" width="84" height="70" rx="30" fill="url(#mg)" stroke="#D9D2FF" stroke-width="3"/>
    <rect x="30" y="40" width="60" height="38" rx="18" fill="#1E1B4B"/>
    <path d="M44 56 q6 -7 12 0" stroke="#5EEAD4" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M64 56 q6 -7 12 0" stroke="#5EEAD4" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M52 66 q8 6 16 0" stroke="#5EEAD4" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="14" cy="60" r="7" fill="#C4B5FD"/><circle cx="106" cy="60" r="7" fill="#C4B5FD"/>
    <path d="M60 112 c-10 -8 -18 -13 -18 -20 a8 8 0 0 1 18 -4 a8 8 0 0 1 18 4 c0 7 -8 12 -18 20z" fill="#8B5CF6"/>
  </svg>`;
}

function ring(pct, color, label) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return `<div class="ring">
    <svg viewBox="0 0 80 80" width="76" height="76" role="img" aria-label="${label} ${p}%">
      <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--line)" stroke-width="8"/>
      ${p > 0 ? `<circle cx="40" cy="40" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${(p / 100) * circ} ${circ}" transform="rotate(-90 40 40)"/>` : ""}
    </svg>
    <span class="ring-label">${label}</span>
    <strong style="color:${color}">${p}%</strong>
  </div>`;
}

function barChart(days, field, color, unit = "") {
  const max = Math.max(1, ...days.map((d) => d[field] || 0));
  const today = dateKey();
  return `<div class="bars">${days.map((d) => {
    const v = d[field] || 0;
    const h = Math.max(4, (v / max) * 100);
    return `<div class="bar-col ${d.key === today ? "is-today" : ""}">
      <span class="bar-val">${v ? v + unit : ""}</span>
      <div class="bar-track"><div class="bar" style="height:${h}%;background:${v ? color : "var(--line)"}"></div></div>
      <span class="bar-label">${d.label}</span>
    </div>`;
  }).join("")}</div>`;
}

function lineChart(days) {
  const w = 300, h = 110, pad = 14;
  const pts = days.map((d, i) => ({ x: pad + (i * (w - 2 * pad)) / 6, y: d.engagement == null ? null : h - pad - (d.engagement / 100) * (h - 2 * pad), v: d.engagement }));
  const valid = pts.filter((p) => p.y != null);
  if (!valid.length) return `<p class="muted small">No engagement data yet this week.</p>`;
  const path = valid.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h + 16}" class="line-chart" role="img" aria-label="Engagement by day">
    ${[0, 50, 100].map((g) => { const y = h - pad - (g / 100) * (h - 2 * pad); return `<line x1="${pad}" x2="${w - pad}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="0" y="${y + 3}" class="axis">${g}</text>`; }).join("")}
    <path d="${path}" fill="none" stroke="#7C4DFF" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${valid.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#fff" stroke="#7C4DFF" stroke-width="2.5"><title>${p.v}%</title></circle>`).join("")}
    ${pts.map((p, i) => `<text x="${p.x}" y="${h + 12}" text-anchor="middle" class="axis">${days[i].label}</text>`).join("")}
  </svg>`;
}

function header(title, sub = "", { back = false, right = "" } = {}) {
  return `<header class="topbar">
    ${back ? `<button class="icon-btn" data-action="back" aria-label="Back">←</button>` : ""}
    <div class="topbar-text"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>
    ${right}
  </header>`;
}

function activityCard(a, { reason = "" } = {}) {
  const cat = CATEGORIES[a.category];
  return `<a class="card activity-card" href="#/exercise/${a.id}">
    <div class="activity-emoji" style="background:${cat.color}1a">${a.emoji}</div>
    <div class="activity-body">
      <div class="row-between"><h3>${esc(a.title)}</h3><span class="tag tag-${a.category}">${cat.label}</span></div>
      <p class="muted">${esc(a.goal)}</p>
      <p class="meta">⏱ ${a.minutes} min · ${a.level}${reason ? ` · <span class="why">✨ ${esc(reason)}</span>` : ""}</p>
    </div>
  </a>`;
}

function logRow(l, { deletable = false } = {}) {
  const a = activity(l.activityId);
  const m = mood(l.mood);
  return `<div class="log-row">
    <div class="activity-emoji sm" style="background:${CATEGORIES[l.category]?.color || "#7C4DFF"}1a">${a?.emoji || CATEGORIES[l.category]?.emoji || "⭐"}</div>
    <div class="grow">
      <strong>${esc(l.name)}</strong>
      <p class="meta">${l.duration} min · ${m ? m.emoji + " " + m.label : ""} · ${prettyDate(l.date)}${l.speech || l.gestures ? ` · 🗣 ${l.speech} · 👆 ${l.gestures}` : ""}</p>
      ${l.notes ? `<p class="muted small">${esc(l.notes)}</p>` : ""}
    </div>
    ${deletable ? `<button class="icon-btn danger" data-action="delete-log" data-id="${l.id}" aria-label="Delete entry">🗑</button>` : ""}
  </div>`;
}

// ---------- views ----------

const views = {};

views.onboarding = () => {
  const p = store.get().profile || {};
  return {
    html: `<section class="onboard">
      <div class="hero">${mascot(110)}
        <h1 class="brand">AI-SORY<br>TALK</h1>
        <p>AI-assisted early intervention support for toddlers with speech delay and autism indicators.</p>
      </div>
      <form id="onboard-form" class="card form">
        <h2>Let's set up your child's profile</h2>
        <label>Your name<input name="parentName" required placeholder="e.g. Aishah" value="${esc(p.parentName)}"></label>
        <label>Child's name<input name="childName" required placeholder="e.g. Luna" value="${esc(p.childName)}"></label>
        <label>Child's age (months)<input name="ageMonths" type="number" min="6" max="72" required placeholder="e.g. 24" value="${esc(p.ageMonths)}"></label>
        <fieldset><legend>What would you like support with?</legend>
          ${CONCERNS.map((c) => `<label class="check"><input type="checkbox" name="concerns" value="${c.id}" ${p.concerns?.includes(c.id) ? "checked" : ""}> ${c.label}</label>`).join("")}
        </fieldset>
        <button class="btn primary" type="submit">Get started</button>
        <button class="btn ghost" type="button" data-action="demo">Try the demo (Luna, 26 months)</button>
        <p class="muted small center">Your data stays on this device. AI-SORY TALK supports — and does not replace — professional therapy.</p>
      </form>
    </section>`,
    mount() {
      document.getElementById("onboard-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        store.setProfile({
          parentName: f.get("parentName").trim(),
          childName: f.get("childName").trim(),
          ageMonths: +f.get("ageMonths"),
          concerns: f.getAll("concerns"),
        });
        location.hash = "#/home";
      });
    },
  };
};

views.home = () => {
  const s = store.get();
  const p = s.profile;
  const t = todayStats(s.logs);
  const last7 = rollingTotals(s.logs, 0, 7);
  const prev7 = rollingTotals(s.logs, 7, 7);
  const goal = p.goalMin || 10;
  const pct = (c) => Math.round((t.byCategory[c] / goal) * 100);
  const recent = s.logs.slice(0, 3);
  const top = recommend(s, 1)[0];
  const speechChange = pctChange(last7.speech, prev7.speech);
  const gestureChange = pctChange(last7.gestures, prev7.gestures);

  return {
    html: `${header(`${esc(p.childName)}'s Dashboard`, `${greeting()}, ${esc(p.parentName)}! ${new Date().getHours() < 18 ? "☀️" : "🌙"}`, {
      right: `<a class="avatar" href="#/settings" aria-label="Settings">${esc(p.childName[0] || "★")}</a>`,
    })}
    ${installBanner()}
    <a class="card today-card" href="#/log">
      <strong>📈 Today's Progress</strong>
      <span>${t.count} activit${t.count === 1 ? "y" : "ies"} completed · ${t.minutes} min total</span>
    </a>
    <div class="card rings">
      ${ring(pct("speech"), CATEGORIES.speech.color, "Speech")}
      ${ring(pct("sensory"), CATEGORIES.sensory.color, "Sensory")}
      ${ring(pct("social"), CATEGORIES.social.color, "Social")}
    </div>
    <p class="muted small center">Daily goal: ${goal} min per area</p>

    <div class="card stats-week">
      <h3>Last 7 days</h3>
      <div class="stat-row">
        <div><span class="big">${last7.speech}</span><span class="muted small">Speech attempts</span>${trend(speechChange, prev7.sessions)}</div>
        <div><span class="big">${last7.gestures}</span><span class="muted small">Gesture use</span>${trend(gestureChange, prev7.sessions)}</div>
        <div><span class="big">${last7.engagement}%</span><span class="muted small">Engagement</span>${trend(last7.engagement - prev7.engagement, prev7.sessions, "pts")}</div>
      </div>
    </div>

    <div class="tiles">
      <a class="tile" href="#/tips"><span class="tile-icon" style="background:#EDE7FF">✨</span><strong>AI Tips</strong><span>Personalized ideas</span></a>
      <a class="tile" href="#/activities"><span class="tile-icon" style="background:#DCFCE7">🧩</span><strong>Activities</strong><span>Guided exercises</span></a>
      <a class="tile" href="#/log"><span class="tile-icon" style="background:#FEF3C7">📝</span><strong>Activity Log</strong><span>Record sessions</span></a>
      <a class="tile" href="#/progress"><span class="tile-icon" style="background:#DBEAFE">📊</span><strong>Progress</strong><span>Weekly charts</span></a>
    </div>

    ${top ? `<h2 class="section">Suggested next activity</h2>${activityCard(top, { reason: top.reason })}` : ""}

    <h2 class="section">Recent Activities</h2>
    ${recent.length ? `<div class="card list">${recent.map((l) => logRow(l)).join("")}</div>` : `<div class="card empty">No activities yet. Start with the suggestion above!</div>`}`,
  };
};

function trend(change, hadPrev, unit = "%") {
  if (!hadPrev) return "";
  const up = change >= 0;
  return `<span class="trend ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(change)}${unit === "%" ? "%" : " " + unit}</span>`;
}

views.tips = () => {
  const s = store.get();
  const recs = recommend(s, 5);
  return {
    html: `${header("AI Recommendations ✨", `Personalized for ${esc(child())}'s developmental stage`)}
    <a class="card ai-card" href="#/chat">
      <strong>💬 Chat with AI Assistant</strong>
      <span>Ask questions about speech development &amp; autism spectrum differences →</span>
    </a>
    <div class="card ai-card alt">
      <strong>💡 AI Insight</strong>
      <span>${esc(dashboardInsight(s))}</span>
    </div>
    <h2 class="section">Recommended for today</h2>
    ${recs.map((a) => activityCard(a, { reason: a.reason })).join("")}`,
  };
};

views.chat = () => {
  const s = store.get();
  const usingClaude = !!s.settings.apiKey;
  const welcome = { role: "assistant", text: `Hi! I'm here to help with questions about speech development and autism spectrum differences. Tell me what you've noticed about ${child()} and I'll suggest what to try. Let's chat! 💙` };
  const msgs = [welcome, ...s.chat];
  return {
    html: `${header("AI Tips Chat", usingClaude ? "Powered by Claude · not a diagnosis" : "Offline coach · not a diagnosis", {
      back: true,
      right: s.chat.length ? `<button class="icon-btn" data-action="clear-chat" aria-label="Clear chat">↺</button>` : "",
    })}
    <div class="chat" id="chat">
      ${msgs.map(bubble).join("")}
    </div>
    <div class="chips" id="chips">${QUICK_PROMPTS.map((q) => `<button class="chip" data-action="quick" data-text="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <form class="composer" id="composer">
      <input id="chat-input" autocomplete="off" placeholder="Type your question…" aria-label="Message">
      <button class="btn primary" type="submit" aria-label="Send">➤</button>
    </form>`,
    mount() {
      const box = document.getElementById("chat");
      box.scrollTop = box.scrollHeight;
      document.getElementById("composer").addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("chat-input");
        sendChat(input.value);
        input.value = "";
      });
    },
    full: true,
  };
};

function bubble(m) {
  const chips = (m.activities || [])
    .map(activity)
    .filter(Boolean)
    .map((a) => `<a class="chip small" href="#/exercise/${a.id}">${a.emoji} ${esc(a.title)}</a>`)
    .join("");
  if (m.role === "user") return `<div class="msg user">${esc(m.text)}</div>`;
  return `<div class="msg-row">${mascot(32)}<div class="msg bot ${m.pending ? "pending" : ""}">${m.pending && !m.text ? `<span class="typing"><i></i><i></i><i></i></span>` : md(m.text)}${chips ? `<div class="msg-chips">${chips}</div>` : ""}${m.note ? `<p class="note">${esc(m.note)}</p>` : ""}</div></div>`;
}

let chatBusy = false;
async function sendChat(text) {
  text = text.trim();
  if (!text || chatBusy) return;
  chatBusy = true;
  store.pushChat({ role: "user", text });
  const s = store.get();
  const box = () => document.getElementById("chat");
  const append = (html) => {
    box()?.insertAdjacentHTML("beforeend", html);
    if (box()) box().scrollTop = box().scrollHeight;
  };
  append(bubble({ role: "user", text }));
  append(`<div id="pending">${bubble({ role: "assistant", text: "", pending: true })}</div>`);
  const setPending = (m) => {
    const el = document.getElementById("pending");
    if (el) el.innerHTML = bubble(m);
    if (box()) box().scrollTop = box().scrollHeight;
  };

  let reply;
  if (s.settings.apiKey) {
    try {
      const out = await askClaude(s, (partial) => setPending({ role: "assistant", text: partial, pending: true }));
      reply = { role: "assistant", text: out, activities: activitiesMentioned(out), source: "claude" };
    } catch (err) {
      const local = localCoach(text, s);
      reply = { role: "assistant", ...local, note: friendlyError(err) };
    }
  } else {
    await new Promise((r) => setTimeout(r, 650));
    reply = { role: "assistant", ...localCoach(text, s) };
  }
  store.pushChat(reply);
  setPending(reply);
  document.getElementById("pending")?.removeAttribute("id");
  chatBusy = false;
}

views.activities = () => {
  const filter = activitiesFilter;
  const list = ACTIVITIES.filter((a) => filter === "all" || a.category === filter);
  return {
    html: `${header("Activities 🧩", "Step-by-step guided exercises")}
    <div class="seg">
      ${["all", ...Object.keys(CATEGORIES)].map((k) => `<button class="seg-btn ${filter === k ? "on" : ""}" data-action="filter" data-cat="${k}">${k === "all" ? "All" : CATEGORIES[k].emoji + " " + CATEGORIES[k].label}</button>`).join("")}
    </div>
    ${list.map((a) => activityCard(a)).join("")}`,
  };
};
let activitiesFilter = "all";

// Guided exercise: step-by-step with timer, then a quick observation form.
let exercise = null;
let exerciseTimer;
views.exercise = (id) => {
  const a = activity(id);
  if (!a) return { html: `${header("Not found", "", { back: true })}<div class="card empty">That activity doesn't exist.</div>` };
  if (!exercise || exercise.id !== id) exercise = { id, step: 0, startedAt: Date.now(), done: false };
  const cat = CATEGORIES[a.category];

  if (exercise.done) {
    const elapsed = Math.round((Date.now() - exercise.startedAt) / 60000);
    const minutes = elapsed >= 2 ? elapsed : a.minutes;
    return {
      html: `${header("Great job! 🎉", `How did ${esc(child())} do in ${esc(a.title)}?`, { back: true })}
      <form id="finish-form" class="card form">
        ${moodPicker("happy")}
        <div class="two">
          ${stepper("speech", "🗣 Speech attempts", 0)}
          ${stepper("gestures", "👆 Gestures", 0)}
        </div>
        <label>Engagement <output id="eng-out">70%</output>
          <input type="range" name="engagement" min="0" max="100" step="5" value="70" oninput="document.getElementById('eng-out').textContent=this.value+'%'">
        </label>
        <label>Duration (min)<input type="number" name="duration" min="1" max="120" value="${minutes}" required></label>
        <label>Notes (optional)<textarea name="notes" rows="2" placeholder="Any observations…"></textarea></label>
        <button class="btn primary" type="submit">Save to Activity Log</button>
      </form>`,
      mount() {
        wireSteppers();
        document.getElementById("finish-form").addEventListener("submit", (e) => {
          e.preventDefault();
          const f = new FormData(e.target);
          store.addLog({
            date: dateKey(), name: a.title, activityId: a.id, category: a.category,
            duration: +f.get("duration"), mood: f.get("mood"), speech: +f.get("speech"),
            gestures: +f.get("gestures"), engagement: +f.get("engagement"), notes: f.get("notes").trim(),
          });
          exercise = null;
          toast("Saved! Progress updated ✅");
          location.hash = "#/home";
        });
      },
    };
  }

  const step = a.steps[exercise.step];
  const n = a.steps.length;
  const last = exercise.step === n - 1;
  return {
    html: `${header("Guided Exercise", `${esc(a.title)} · ${cat.label}`, { back: true })}
    <div class="card exercise">
      <div class="exercise-art" style="background:linear-gradient(135deg, ${cat.color}22, #EDE7FF)">
        <span>${a.emoji}</span>
      </div>
      <p class="meta">Step ${exercise.step + 1} of ${n} · ⏱ <span id="timer">0:00</span></p>
      <div class="progress"><div style="width:${((exercise.step + 1) / n) * 100}%"></div></div>
      <h2>${esc(step.title)}</h2>
      <p class="lead">${esc(step.text)}</p>
      <div class="row-between gap">
        <button class="btn ghost" data-action="ex-prev" ${exercise.step === 0 ? "disabled" : ""}>← Back</button>
        <button class="btn primary grow" data-action="ex-next">${last ? "Finish ✓" : "Next Step →"}</button>
      </div>
    </div>
    <div class="card soft"><strong>🎯 Goal</strong><p class="muted">${esc(a.goal)}</p></div>`,
    mount() {
      const tick = () => {
        const el = document.getElementById("timer");
        if (!el || !exercise) return clearInterval(exerciseTimer);
        const sec = Math.floor((Date.now() - exercise.startedAt) / 1000);
        el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
      };
      clearInterval(exerciseTimer);
      exerciseTimer = setInterval(tick, 1000);
      tick();
    },
  };
};

function moodPicker(selected) {
  return `<fieldset class="moods"><legend>Child's mood</legend>
    ${MOODS.map((m) => `<label class="mood"><input type="radio" name="mood" value="${m.id}" ${m.id === selected ? "checked" : ""}><span>${m.emoji}<small>${m.label}</small></span></label>`).join("")}
  </fieldset>`;
}

function stepper(name, label, value) {
  return `<div class="stepper-wrap"><span class="label">${label}</span><div class="stepper">
    <button type="button" data-step="-1" data-for="${name}" aria-label="Decrease">−</button>
    <input name="${name}" type="number" min="0" max="99" value="${value}" inputmode="numeric">
    <button type="button" data-step="1" data-for="${name}" aria-label="Increase">+</button>
  </div></div>`;
}

function wireSteppers() {
  app.querySelectorAll("[data-step]").forEach((b) =>
    b.addEventListener("click", () => {
      const input = app.querySelector(`input[name="${b.dataset.for}"]`);
      input.value = Math.max(0, Math.min(99, (+input.value || 0) + +b.dataset.step));
    }),
  );
}

let progressOffset = 0;
views.progress = () => {
  const s = store.get();
  const week = weekStats(s.logs, progressOffset);
  const prev = weekStats(s.logs, progressOffset - 1);
  const cmp = comparableTotals(week, prev);
  const total = week.totals.sessions || 1;
  const gap = skillGap(s);
  const end = new Date(week.start);
  end.setDate(end.getDate() + 6);
  const range = `${week.start.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${end.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  const riskClass = { High: "high", Moderate: "mod", Low: "low" }[gap.risk] || "";

  return {
    html: `${header("Progress Tracking 📊", `${esc(child())}'s weekly overview`)}
    <div class="week-nav">
      <button class="icon-btn" data-action="week" data-dir="-1" aria-label="Previous week">‹</button>
      <strong>${progressOffset === 0 ? "This week" : progressOffset === -1 ? "Last week" : range}</strong>
      <button class="icon-btn" data-action="week" data-dir="1" ${progressOffset >= 0 ? "disabled" : ""} aria-label="Next week">›</button>
    </div>
    <div class="card ai-card alt"><strong>💡 AI Insight</strong><span>${esc(progressInsight(s, week, prev))}</span></div>
    <div class="kpis">
      <div class="card kpi"><span class="big">${week.totals.minutes}</span><span class="muted small">Minutes</span></div>
      <div class="card kpi"><span class="big green">${week.totals.sessions}</span><span class="muted small">Sessions</span></div>
      <div class="card kpi"><span class="big amber">${week.totals.activeDays}</span><span class="muted small">Active days</span></div>
    </div>
    <div class="card"><h3>Weekly Activity (minutes)</h3>${barChart(week.days, "minutes", "#7C4DFF")}</div>
    <div class="card"><h3>Speech Attempts</h3>${barChart(week.days, "speech", "#22C55E")}
      <p class="meta">Total: <strong>${week.totals.speech}</strong> ${cmp.sessions ? trend(pctChange(week.totals.speech, cmp.speech), true) + " vs same days the week before" : ""}</p></div>
    <div class="card"><h3>Engagement Rate</h3>${lineChart(week.days)}</div>
    <div class="card"><h3>Category Breakdown</h3>
      ${Object.entries(CATEGORIES).map(([k, c]) => {
        const v = week.byCategory[k];
        const p = Math.round((v.sessions / total) * 100);
        return `<div class="cat-row"><div class="row-between"><span>${c.emoji} ${c.label}</span><span class="muted small">${v.sessions} sessions · ${week.totals.sessions ? p : 0}%</span></div>
          <div class="meter"><div style="width:${week.totals.sessions ? p : 0}%;background:${c.color}"></div></div></div>`;
      }).join("")}
    </div>
    <div class="card">
      <div class="row-between"><h3>Skill-gap check</h3><span class="risk ${riskClass}">${gap.risk}</span></div>
      <p class="muted small">Last 7 days of home practice · not a diagnosis</p>
      ${gap.skills.map((sk) => `<div class="cat-row"><div class="row-between"><span>${sk.label}</span><span class="muted small">${sk.value}%</span></div>
        <div class="meter"><div style="width:${sk.value}%;background:${sk.value < 40 ? "#EF4444" : sk.value < 65 ? "#F59E0B" : "#22C55E"}"></div></div></div>`).join("")}
      <p class="suggest"><strong>Suggested action:</strong> ${esc(gap.action)}</p>
    </div>`,
  };
};

views.log = () => {
  const s = store.get();
  return {
    html: `${header("Activity Log 📝", "Record your sessions")}
    <form id="log-form" class="card form">
      <h3>New Entry</h3>
      <div class="two">
        <label>Date<input type="date" name="date" value="${dateKey()}" max="${dateKey()}" required></label>
        <label>Duration (min)<input type="number" name="duration" min="1" max="180" value="10" required></label>
      </div>
      <label>Activity name<input name="name" list="activity-names" placeholder="e.g. Bubble Play" required></label>
      <datalist id="activity-names">${ACTIVITIES.map((a) => `<option value="${esc(a.title)}">`).join("")}</datalist>
      <label>Category<select name="category">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${c.emoji} ${c.label}</option>`).join("")}</select></label>
      ${moodPicker("happy")}
      <div class="two">
        ${stepper("speech", "🗣 Speech attempts", 0)}
        ${stepper("gestures", "👆 Gestures", 0)}
      </div>
      <label>Engagement <output id="eng-out">70%</output>
        <input type="range" name="engagement" min="0" max="100" step="5" value="70" oninput="document.getElementById('eng-out').textContent=this.value+'%'">
      </label>
      <label>Notes (optional)<textarea name="notes" rows="2" placeholder="Any observations…"></textarea></label>
      <button class="btn primary" type="submit">Save Entry</button>
    </form>
    <h2 class="section">Recent Entries</h2>
    ${s.logs.length ? `<div class="card list">${s.logs.slice(0, 30).map((l) => logRow(l, { deletable: true })).join("")}</div>` : `<div class="card empty">No entries yet.</div>`}`,
    mount() {
      wireSteppers();
      const form = document.getElementById("log-form");
      const field = (n) => form.elements.namedItem(n);
      field("name").addEventListener("change", () => {
        const a = ACTIVITIES.find((x) => x.title.toLowerCase() === field("name").value.trim().toLowerCase());
        if (a) {
          field("category").value = a.category;
          field("duration").value = a.minutes;
        }
      });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const name = f.get("name").trim();
        const a = ACTIVITIES.find((x) => x.title.toLowerCase() === name.toLowerCase());
        store.addLog({
          date: f.get("date"), name, activityId: a?.id || null, category: f.get("category"),
          duration: +f.get("duration"), mood: f.get("mood"), speech: +f.get("speech"),
          gestures: +f.get("gestures"), engagement: +f.get("engagement"), notes: f.get("notes").trim(),
        });
        toast("Entry saved ✅");
        render();
      });
    },
  };
};

views.settings = () => {
  const s = store.get();
  const p = s.profile;
  return {
    html: `${header("Settings", "Profile, AI assistant and data", { back: true })}
    <form id="profile-form" class="card form">
      <h3>Profile</h3>
      <label>Your name<input name="parentName" required value="${esc(p.parentName)}"></label>
      <div class="two">
        <label>Child's name<input name="childName" required value="${esc(p.childName)}"></label>
        <label>Age (months)<input name="ageMonths" type="number" min="6" max="72" required value="${esc(p.ageMonths)}"></label>
      </div>
      <label>Daily goal per area (min)<input name="goalMin" type="number" min="5" max="60" value="${p.goalMin || 10}"></label>
      <fieldset><legend>Support focus</legend>
        ${CONCERNS.map((c) => `<label class="check"><input type="checkbox" name="concerns" value="${c.id}" ${p.concerns?.includes(c.id) ? "checked" : ""}> ${c.label}</label>`).join("")}
      </fieldset>
      <button class="btn primary" type="submit">Save profile</button>
    </form>

    <form id="ai-form" class="card form">
      <h3>AI assistant</h3>
      <p class="muted small">Without a key, AI Tips Chat uses the built-in offline coach. Add a Claude API key to get fully conversational answers. The key is stored only on this device and sent only to Anthropic.</p>
      <label>Claude API key<input name="apiKey" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(s.settings.apiKey)}"></label>
      <div class="row-between gap">
        <button class="btn primary grow" type="submit">Save key</button>
        ${s.settings.apiKey ? `<button class="btn ghost" type="button" data-action="remove-key">Remove</button>` : ""}
      </div>
      <p class="status ${s.settings.apiKey ? "on" : ""}">${s.settings.apiKey ? "● Claude assistant on" : "○ Offline coach"}</p>
    </form>

    <div class="card form">
      <h3>Data</h3>
      ${deferredInstall ? `<button class="btn primary" data-action="install">📲 Install app on this device</button>` : ""}
      <button class="btn ghost" data-action="export">⬇ Export my data (JSON)</button>
      <button class="btn ghost" data-action="demo">Load demo data (Luna)</button>
      <button class="btn danger-btn" data-action="reset">Reset everything</button>
    </div>
    <p class="muted small center">AI-SORY TALK · ITEX 2026 prototype · UNITEN<br>Supports, and does not replace, professional therapy.</p>`,
    mount() {
      document.getElementById("profile-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        store.setProfile({
          parentName: f.get("parentName").trim(), childName: f.get("childName").trim(),
          ageMonths: +f.get("ageMonths"), goalMin: +f.get("goalMin") || 10, concerns: f.getAll("concerns"),
        });
        toast("Profile saved");
      });
      document.getElementById("ai-form").addEventListener("submit", (e) => {
        e.preventDefault();
        store.setApiKey(new FormData(e.target).get("apiKey"));
        toast(store.get().settings.apiKey ? "Claude assistant enabled" : "Using offline coach");
        render();
      });
    },
  };
};

// ---------- install prompt ----------

let deferredInstall = null;
let installDismissed = false;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (currentRoute() === "home") render();
});

function installBanner() {
  if (!deferredInstall || installDismissed) return "";
  return `<div class="card install"><span>📲 Install AI-SORY TALK on your phone</span>
    <button class="btn primary sm" data-action="install">Install</button>
    <button class="icon-btn" data-action="dismiss-install" aria-label="Dismiss">✕</button></div>`;
}

// ---------- actions ----------

app.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case "back":
      history.length > 1 ? history.back() : (location.hash = "#/home");
      break;
    case "demo":
      store.loadDemo();
      toast("Demo data loaded");
      location.hash = "#/home";
      render();
      break;
    case "filter":
      activitiesFilter = el.dataset.cat;
      render();
      break;
    case "ex-next": {
      const a = activity(exercise.id);
      if (exercise.step < a.steps.length - 1) exercise.step++;
      else exercise.done = true;
      render();
      break;
    }
    case "ex-prev":
      exercise.step = Math.max(0, exercise.step - 1);
      render();
      break;
    case "quick":
      sendChat(el.dataset.text);
      break;
    case "clear-chat":
      store.clearChat();
      render();
      break;
    case "delete-log":
      if (confirm("Delete this entry?")) {
        store.deleteLog(el.dataset.id);
        render();
      }
      break;
    case "week":
      progressOffset = Math.min(0, progressOffset + +el.dataset.dir);
      render();
      break;
    case "remove-key":
      store.setApiKey("");
      render();
      break;
    case "export": {
      const blob = new Blob([store.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `aisory-talk-${dateKey()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      break;
    }
    case "reset":
      if (confirm("This deletes the profile, all log entries and chat history on this device. Continue?")) {
        store.reset();
        location.hash = "#/onboarding";
      }
      break;
    case "install":
      if (deferredInstall) {
        deferredInstall.prompt();
        await deferredInstall.userChoice;
        deferredInstall = null;
        render();
      }
      break;
    case "dismiss-install":
      installDismissed = true;
      render();
      break;
  }
});

// ---------- router ----------

const NAV = [
  { route: "home", icon: "🏠", label: "Home" },
  { route: "tips", icon: "✨", label: "AI Tips", also: ["chat"] },
  { route: "activities", icon: "🧩", label: "Activities", also: ["exercise"] },
  { route: "progress", icon: "📊", label: "Progress" },
  { route: "log", icon: "📝", label: "Log" },
];

function currentRoute() {
  return (location.hash.replace(/^#\/?/, "").split("/")[0]) || "home";
}

function render() {
  const [route, param] = location.hash.replace(/^#\/?/, "").split("/");
  const hasProfile = !!store.get().profile;
  let name = route || "home";
  if (!hasProfile) name = "onboarding";
  else if (name === "onboarding" || !views[name]) name = "home";

  if (name !== "exercise") exercise = null;
  const view = views[name](param);
  app.className = `screen screen-${name}${view.full ? " full" : ""}`;
  app.innerHTML = view.html;
  view.mount?.();

  nav.hidden = name === "onboarding";
  nav.innerHTML = NAV.map((n) => {
    const on = n.route === name || n.also?.includes(name);
    return `<a href="#/${n.route}" class="${on ? "on" : ""}" ${on ? 'aria-current="page"' : ""}><span>${n.icon}</span>${n.label}</a>`;
  }).join("");
  if (!view.full) window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);
render();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
