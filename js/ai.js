// Intelligence layer: weekly analytics, the Gen-AI style recommender,
// insights, skill-gap monitoring, the offline coach and the optional
// Claude-powered assistant.
import { ACTIVITIES, CATEGORIES, COACH_TOPICS, COACH_FALLBACK, MOODS } from "./data.js";
import { dateKey, currentAgeMonths } from "./store.js";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const moodScore = (id) => MOODS.find((m) => m.id === id)?.score ?? 0.6;

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}

// ---------- Analytics ----------

export function weekStats(logs, offsetWeeks = 0) {
  const start = startOfWeek();
  start.setDate(start.getDate() + offsetWeeks * 7);
  const days = DAY_LABELS.map((label, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { key: dateKey(d), label, date: d, minutes: 0, sessions: 0, speech: 0, gestures: 0, engagementSum: 0 };
  });
  const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
  const byCategory = Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, { sessions: 0, minutes: 0 }]));
  const totals = { minutes: 0, sessions: 0, speech: 0, gestures: 0, engagementSum: 0 };

  for (const l of logs) {
    const day = byKey[l.date];
    if (!day) continue;
    day.minutes += +l.duration || 0;
    day.sessions += 1;
    day.speech += +l.speech || 0;
    day.gestures += +l.gestures || 0;
    day.engagementSum += +l.engagement || 0;
    totals.minutes += +l.duration || 0;
    totals.sessions += 1;
    totals.speech += +l.speech || 0;
    totals.gestures += +l.gestures || 0;
    totals.engagementSum += +l.engagement || 0;
    if (byCategory[l.category]) {
      byCategory[l.category].sessions += 1;
      byCategory[l.category].minutes += +l.duration || 0;
    }
  }
  days.forEach((d) => (d.engagement = d.sessions ? Math.round(d.engagementSum / d.sessions) : null));
  return {
    start,
    days,
    byCategory,
    totals: {
      ...totals,
      activeDays: days.filter((d) => d.sessions > 0).length,
      engagement: totals.sessions ? Math.round(totals.engagementSum / totals.sessions) : 0,
    },
  };
}

// Previous week's totals over the same number of days that have elapsed in
// the compared week, so a partial week isn't measured against a full one.
export function comparableTotals(week, prevWeek) {
  const today = dateKey();
  const idx = week.days.findIndex((d) => d.key === today);
  const days = prevWeek.days.slice(0, idx === -1 ? 7 : idx + 1);
  return {
    sessions: days.reduce((s, d) => s + d.sessions, 0),
    speech: days.reduce((s, d) => s + d.speech, 0),
    gestures: days.reduce((s, d) => s + d.gestures, 0),
    minutes: days.reduce((s, d) => s + d.minutes, 0),
  };
}

export function todayStats(logs) {
  const key = dateKey();
  const today = logs.filter((l) => l.date === key);
  const byCategory = Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, 0]));
  today.forEach((l) => (byCategory[l.category] = (byCategory[l.category] || 0) + (+l.duration || 0)));
  return { count: today.length, minutes: today.reduce((s, l) => s + (+l.duration || 0), 0), byCategory };
}

// Totals for a rolling window, e.g. (0, 7) = last 7 days incl. today, (7, 7) = the 7 days before that.
export function rollingTotals(logs, daysAgo, length) {
  const end = new Date();
  end.setDate(end.getDate() - daysAgo);
  const start = new Date(end);
  start.setDate(start.getDate() - (length - 1));
  const [from, to] = [dateKey(start), dateKey(end)];
  const sel = logs.filter((l) => l.date >= from && l.date <= to);
  return {
    sessions: sel.length,
    minutes: sel.reduce((s, l) => s + (+l.duration || 0), 0),
    speech: sel.reduce((s, l) => s + (+l.speech || 0), 0),
    gestures: sel.reduce((s, l) => s + (+l.gestures || 0), 0),
    engagement: sel.length ? Math.round(sel.reduce((s, l) => s + (+l.engagement || 0), 0) / sel.length) : 0,
  };
}

export function pctChange(now, before) {
  if (!before) return now ? 100 : 0;
  return Math.round(((now - before) / before) * 100);
}

function recentLogs(logs, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const key = dateKey(cutoff);
  return logs.filter((l) => l.date >= key);
}

// ---------- Recommender ----------

const FOCUS_PHRASE = {
  imitation: "imitation and music games",
  "joint-attention": "shared-attention play",
  "eye-contact": "face-to-face games",
  sensory: "sensory play",
  "oral-motor": "bubble and blowing games",
  speech: "word games",
  gesture: "choice-making routines",
  social: "turn-taking games",
};

function hash(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function recommend(state, count = 4) {
  const { profile, logs } = state;
  const goal = profile?.goalMin || 10;
  const concerns = profile?.concerns || [];
  const week = recentLogs(logs, 7);
  const catMinutes = Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, 0]));
  week.forEach((l) => (catMinutes[l.category] += +l.duration || 0));

  const todayKey = dateKey();
  const twoDaysAgo = dateKey(new Date(Date.now() - 2 * 864e5));
  const concernBoost = {
    speech: concerns.includes("speech") ? 0.35 : 0,
    social: (concerns.includes("asd") || concerns.includes("eye") || concerns.includes("social")) ? 0.3 : 0,
    sensory: concerns.includes("sensory") ? 0.35 : concerns.includes("asd") ? 0.15 : 0,
  };

  const scored = ACTIVITIES.map((a) => {
    const reasons = [];
    let score = 0.2;

    const need = 1 - Math.min(1, catMinutes[a.category] / (goal * 4));
    score += need * 0.8;
    if (need > 0.6) reasons.push({ w: need, text: `${CATEGORIES[a.category].label} practice is low this week` });

    if (concernBoost[a.category]) {
      score += concernBoost[a.category];
      reasons.push({ w: concernBoost[a.category], text: "Matches your support focus" });
    }

    const past = logs.filter((l) => l.activityId === a.id);
    if (past.length) {
      const avg = past.reduce((s, l) => s + moodScore(l.mood) * 0.5 + (l.engagement / 100) * 0.5, 0) / past.length;
      score += (avg - 0.55) * 0.9;
      if (avg > 0.7) reasons.push({ w: avg, text: `${profile?.childName || "Your child"} enjoyed this before` });
      if (past.some((l) => l.date === todayKey)) score -= 0.7;
      else if (past.some((l) => l.date >= twoDaysAgo)) score -= 0.2;
    } else {
      score += 0.1;
      reasons.push({ w: 0.2, text: "New activity to try" });
    }

    const age = currentAgeMonths(profile);
    if (age && age + 3 < a.ageMin) score -= 1;
    score += (hash(a.id + todayKey) % 100) / 600; // gentle daily variety

    reasons.sort((x, y) => y.w - x.w);
    return { ...a, score, reason: reasons[0]?.text || "Good fit for today" };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, count);
}

// ---------- Insights ----------

export function dashboardInsight(state) {
  const { logs, profile } = state;
  const c = profile?.childName || "your child";
  if (!logs.length) return `Start with one short, playful activity today. Even 5 minutes of face-to-face play helps ${c} learn.`;

  const tagStats = {};
  for (const l of recentLogs(logs, 14)) {
    const a = ACTIVITIES.find((x) => x.id === l.activityId);
    if (!a) continue;
    for (const tag of a.focus) {
      tagStats[tag] ??= { sum: 0, n: 0 };
      tagStats[tag].sum += (l.engagement / 100) * 0.6 + moodScore(l.mood) * 0.4;
      tagStats[tag].n += 1;
    }
  }
  const best = Object.entries(tagStats)
    .filter(([, s]) => s.n >= 2)
    .map(([tag, s]) => ({ tag, avg: s.sum / s.n }))
    .sort((a, b) => b.avg - a.avg)[0];

  if (best && FOCUS_PHRASE[best.tag]) {
    return `Based on recent patterns, ${c} responds well to ${FOCUS_PHRASE[best.tag]}. Try a few more of these this week!`;
  }
  return `Great start! Keep sessions short and regular — consistency matters more than length for ${c}.`;
}

export function progressInsight(state, week, prevWeek) {
  const c = state.profile?.childName || "your child";
  const missing = Object.entries(week.byCategory).filter(([, v]) => v.sessions === 0).map(([k]) => CATEGORIES[k].label.toLowerCase());
  if (!week.totals.sessions) return `No sessions logged this week yet. Try one 10-minute activity today to get ${c}'s week started.`;
  if (missing.includes("speech")) return `Speech activities haven't been logged this week. Consider adding verbal exercises to support ${c}'s language development.`;
  const prev = comparableTotals(week, prevWeek);
  const change = pctChange(week.totals.speech, prev.speech);
  if (prev.sessions && change > 0) return `${c}'s speech attempts are up ${change}% compared with the same days last week. Keep the same routines going!`;
  if (missing.length) return `Nice consistency! ${missing[0][0].toUpperCase() + missing[0].slice(1)} activities are missing this week — adding one would give ${c} a more balanced routine.`;
  return `${c} practised on ${week.totals.activeDays} day${week.totals.activeDays === 1 ? "" : "s"} this week. Aim for a little practice every day.`;
}

// Practice-based monitoring of three early communication signals.
// This is a home-practice indicator, never a diagnosis.
export function skillGap(state) {
  const week = recentLogs(state.logs, 7);
  const sessions = week.length;
  const speech = week.reduce((s, l) => s + (+l.speech || 0), 0);
  const gestures = week.reduce((s, l) => s + (+l.gestures || 0), 0);
  const engagement = sessions ? week.reduce((s, l) => s + (+l.engagement || 0), 0) / sessions : 0;

  const skills = [
    { id: "speech", label: "Speech imitation", value: Math.min(100, Math.round((speech / 15) * 100)) },
    { id: "gesture", label: "Gesture use", value: Math.min(100, Math.round((gestures / 15) * 100)) },
    { id: "engagement", label: "Engagement", value: Math.round(engagement) },
  ];
  const lowest = [...skills].sort((a, b) => a.value - b.value)[0];
  const risk = !sessions ? "Not enough data" : lowest.value < 40 ? "High" : lowest.value < 65 ? "Moderate" : "Low";
  const action = {
    speech: "Add more imitation and turn-taking activities in the next 3 days.",
    gesture: "Use choice-making at snack time and model pointing during play.",
    engagement: "Keep sessions shorter and follow your child's favourite interests.",
  }[lowest.id];
  const text = !sessions
    ? "Log a few sessions to unlock skill-gap monitoring."
    : risk === "Low" ? `On track — keep up the daily routine. ${action}` : action;
  return { skills, risk, action: text, sessions };
}

// ---------- Overall result ----------

// Logs from a rolling window: daysAgo 0 = ending today, length in days.
function windowLogs(logs, daysAgo, length) {
  const end = new Date();
  end.setDate(end.getDate() - daysAgo);
  const start = new Date(end);
  start.setDate(start.getDate() - (length - 1));
  const [from, to] = [dateKey(start), dateKey(end)];
  return { logs: logs.filter((l) => l.date >= from && l.date <= to), from: start, to: end };
}

function summarize(logs) {
  const n = logs.length;
  const sum = (f) => logs.reduce((s, l) => s + (+l[f] || 0), 0);
  const speech = sum("speech");
  const gestures = sum("gestures");
  return {
    sessions: n,
    activeDays: new Set(logs.map((l) => l.date)).size,
    speech,
    gestures,
    commPerSession: n ? (speech + gestures) / n : 0,
    speechPerSession: n ? speech / n : 0,
    engagement: n ? sum("engagement") / n : 0,
    negativeMoods: logs.filter((l) => l.mood === "fussy" || l.mood === "tired").length,
    categories: new Set(logs.map((l) => l.category).filter((c) => CATEGORIES[c])),
  };
}

const round1 = (x) => Math.round(x * 10) / 10;
const rating = (ratio) => (ratio >= 0.75 ? "good" : ratio >= 0.45 ? "warn" : "bad");

// Summarises the child's last 14 days of logged home practice into one of:
// insufficient | doctor | great | good | low. Every reason shown to the parent
// is computed from the logs below — nothing is assumed or invented.
export function overallSummary(state) {
  const c = state.profile?.childName || "your child";
  const age = currentAgeMonths(state.profile);
  const cur = windowLogs(state.logs, 0, 14);
  const prior = windowLogs(state.logs, 14, 14);
  const now = summarize(cur.logs);
  const before = summarize(prior.logs);
  const last7 = summarize(windowLogs(state.logs, 0, 7).logs);
  const prev7 = summarize(windowLogs(state.logs, 7, 7).logs);
  const fmt = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const basis = `${now.sessions} session${now.sessions === 1 ? "" : "s"} on ${now.activeDays} day${now.activeDays === 1 ? "" : "s"} · ${fmt(cur.from)} – ${fmt(cur.to)}`;

  if (now.sessions < 3 || now.activeDays < 2) {
    return {
      status: "insufficient",
      title: "Not enough data yet",
      emoji: "📋",
      message: `Log at least 3 sessions on 2 or more days to see ${c}'s overall result. So far: ${now.sessions} session${now.sessions === 1 ? "" : "s"} in the last 14 days.`,
      score: null,
      factors: [],
      flags: [],
      nextSteps: ["Try one short activity from AI Tips today and save it to the log."],
      basis,
    };
  }

  // Red flags — need enough sessions to be meaningful, and always point to a professional.
  const flags = [];
  if (now.sessions >= 5) {
    if (age >= 18 && now.speech === 0) {
      flags.push(`No speech attempts were recorded in any of the last ${now.sessions} sessions, and ${c} is ${age} months old.`);
    }
    if (age >= 12 && now.gestures === 0) {
      flags.push(`No gestures (such as pointing or waving) were recorded in the last ${now.sessions} sessions, and ${c} is ${age} months old.`);
    }
    if (before.sessions >= 5 && before.commPerSession >= 2 && now.commPerSession <= before.commPerSession * 0.5) {
      flags.push(`Speech attempts and gestures fell from ${round1(before.commPerSession)} to ${round1(now.commPerSession)} per session compared with the 2 weeks before. A drop like this can be a sign of losing skills.`);
    }
    if (now.engagement < 35 && now.negativeMoods / now.sessions >= 0.6) {
      flags.push(`Engagement averaged ${Math.round(now.engagement)}% and ${now.negativeMoods} of ${now.sessions} sessions were fussy or tired.`);
    }
  }

  // Score out of 100 from five measured factors.
  const consistency = Math.min(1, now.activeDays / 8);
  const engagement = now.engagement / 100;
  const communication = Math.min(1, now.commPerSession / 4);
  const coverage = now.categories.size / 3;
  const missing = Object.keys(CATEGORIES).filter((k) => !now.categories.has(k)).map((k) => CATEGORIES[k].label.toLowerCase());

  let trend = 0.6;
  let trendText = "Not enough sessions in both weeks to compare";
  let trendChange = null;
  if (last7.sessions >= 2 && prev7.sessions >= 2 && prev7.commPerSession > 0) {
    trendChange = Math.round(((last7.commPerSession - prev7.commPerSession) / prev7.commPerSession) * 100);
    trend = trendChange >= 10 ? 1 : trendChange > -10 ? 0.6 : 0.2;
    trendText = trendChange >= 10 ? `Up ${trendChange}% vs the week before` : trendChange > -10 ? "Steady vs the week before" : `Down ${Math.abs(trendChange)}% vs the week before`;
  }

  const factors = [
    { id: "consistency", label: "Practice days", value: `${now.activeDays} of the last 14 days`, ratio: consistency, weight: 30 },
    { id: "engagement", label: "Engagement", value: `${Math.round(now.engagement)}% on average`, ratio: engagement, weight: 25 },
    { id: "communication", label: "Speech attempts + gestures", value: `${round1(now.commPerSession)} per session (${now.speech} + ${now.gestures} in total)`, ratio: communication, weight: 25 },
    { id: "coverage", label: "Areas practised", value: missing.length ? `${now.categories.size} of 3 · no ${missing.join(" or ")} yet` : "All 3 areas", ratio: coverage, weight: 10 },
    { id: "trend", label: "This week's trend", value: trendText, ratio: trend, weight: 10 },
  ].map((f) => ({
    ...f,
    rating: f.id !== "trend" ? rating(f.ratio) : trendChange === null || trend === 0.6 ? "none" : trend === 1 ? "good" : "bad",
    points: Math.round(f.ratio * f.weight),
  }));
  const score = Math.round(factors.reduce((s, f) => s + f.ratio * f.weight, 0));

  const tips = {
    consistency: `Aim for a short session on most days — even 5–10 minutes counts.`,
    engagement: `Keep sessions short and choose activities ${c} enjoyed before (see AI Tips).`,
    communication: `During play, pause and wait about 5 seconds so ${c} has a chance to babble, gesture or say a word.`,
    coverage: `Add a ${missing[0] || "new"} activity — it hasn't been practised in the last 2 weeks.`,
    trend: `Speech attempts and gestures dipped this week — go back to the activities that worked well before.`,
  };
  // Tips for the factors losing the most points first.
  const lost = (f) => f.weight * (1 - f.ratio);
  const weakest = factors
    .filter((f) => (f.id === "trend" ? trendChange !== null && trendChange <= -10 : f.rating !== "good"))
    .sort((a, b) => lost(b) - lost(a));

  if (flags.length) {
    return {
      status: "doctor",
      title: "Consider seeing a doctor",
      emoji: "🩺",
      message: `Some patterns in ${c}'s recent logs are worth checking with a doctor or speech-language therapist. This is not a diagnosis — a professional can tell you more.`,
      score,
      factors,
      flags,
      nextSteps: [
        "Book a check-up with your doctor or a speech-language therapist.",
        "Show them this Progress screen, or export your data from Settings.",
        "Keep practising at home while you wait — it still helps.",
      ],
      basis,
    };
  }

  // Regular practice is the base of home intervention: "Doing great" needs practice on most
  // days (6+ of 14), and fewer than 4 practice days in two weeks always counts as low.
  let status = score >= 75 ? "great" : score >= 50 ? "good" : "low";
  if (status === "great" && now.activeDays < 6) status = "good";
  if (now.activeDays < 4) status = "low";
  const copy = {
    great: { title: "Doing great", emoji: "🌟", message: `${c} is practising regularly and responding well. Keep up the routine!` },
    good: { title: "Good progress", emoji: "👍", message: `${c} is making progress. A few small changes could help even more.` },
    low: { title: "Progress is low", emoji: "🔸", message: `${c}'s recent practice is lower than recommended. Small, regular sessions can make a real difference.` },
  }[status];
  if (status === "low" && score >= 50) {
    copy.message = `${c} responds well in sessions, but practice happened on only ${now.activeDays} of the last 14 days. Small, regular sessions make the biggest difference.`;
  } else if (status === "good" && score >= 75) {
    copy.message = `${c} is doing well in sessions. Practising on 6 or more days in 2 weeks would move this to "Doing great".`;
  }
  const nextSteps = weakest.slice(0, status === "low" ? 2 : 1).map((f) => tips[f.id]);
  if (!nextSteps.length) {
    const room = factors.filter((f) => f.id !== "trend" && f.ratio < 1).sort((a, b) => lost(b) - lost(a))[0];
    nextSteps.push(status !== "great" && room ? tips[room.id] : "Keep the same routine, and try a new activity now and then to keep it fun.");
  }

  return { status, ...copy, score, factors, flags, nextSteps, basis };
}

// ---------- Offline coach ----------

export function localCoach(text, state) {
  const c = state.profile?.childName || "your child";
  const q = text.toLowerCase();
  let best = null;
  let bestHits = 0;
  for (const topic of COACH_TOPICS) {
    const hits = topic.keywords.filter((k) => q.includes(k)).length;
    if (hits > bestHits) {
      best = topic;
      bestHits = hits;
    }
  }
  const week = weekStats(state.logs);
  let reply = best ? best.reply(c) : COACH_FALLBACK(c);
  if (week.totals.sessions) {
    const low = Object.entries(week.byCategory).sort((a, b) => a[1].minutes - b[1].minutes)[0];
    reply += `\n\n📊 This week ${c} has done **${week.totals.sessions} session${week.totals.sessions === 1 ? "" : "s"}** (${week.totals.minutes} min). ${CATEGORIES[low[0]].label} practice is the lowest so far.`;
  }
  const activities = best?.activities?.length ? best.activities : recommend(state, 2).map((a) => a.id);
  return { text: reply, activities };
}

// ---------- Claude assistant (optional) ----------

let anthropicModule = null;
async function loadSdk() {
  anthropicModule ??= await import("https://esm.sh/@anthropic-ai/sdk@0.65.0");
  return anthropicModule;
}

function systemPrompt(state) {
  const p = state.profile || {};
  const week = weekStats(state.logs);
  const cats = Object.entries(week.byCategory)
    .map(([k, v]) => `${CATEGORIES[k].label}: ${v.sessions} sessions, ${v.minutes} min`)
    .join("; ");
  const recent = state.logs
    .slice(0, 8)
    .map((l) => `${l.date} ${l.name} (${l.category}, ${l.duration} min, mood ${l.mood}, speech attempts ${l.speech}, gestures ${l.gestures}, engagement ${l.engagement}%)${l.notes ? ` notes: ${l.notes}` : ""}`)
    .join("\n");
  const activityList = ACTIVITIES.map((a) => `- ${a.title} (${a.category}, ${a.minutes} min)`).join("\n");

  return `You are the AI Tips assistant inside AI-SORY TALK, a mobile app that helps parents and guardians support toddlers with early speech delay and autism (ASD) indicators at home.

Who you are talking to: ${p.parentName || "a parent"}, caring for ${p.childName || "their child"} (${currentAgeMonths(p) || "unknown"} months old). Support focus: ${(p.concerns || []).join(", ") || "not specified"}.

This week's practice: ${week.totals.sessions} sessions, ${week.totals.minutes} min, ${week.totals.speech} speech attempts, ${week.totals.gestures} gestures, average engagement ${week.totals.engagement}%. By category — ${cats}.
Recent log entries:
${recent || "(none yet)"}

Activities available in the app (mention them by exact title when one fits):
${activityList}

How to respond:
- Be warm, encouraging and practical. Parents are often worried; acknowledge feelings briefly, then give 2–4 concrete things to try at home today.
- Keep replies short enough to read on a phone (under about 150 words). Use simple bullet points and **bold** for key actions. No headings or tables.
- Reply in the language the parent writes in (English or Bahasa Melayu are both common).
- You do not diagnose and you do not replace a doctor or speech-language therapist. If the parent describes red flags (loss of skills, no response to sounds or name, no words by 16–18 months, no 2-word phrases by 24 months, safety concerns), gently recommend seeing a professional.
- Use the practice data above when it is relevant, and name the child.`;
}

export async function askClaude(state, onText) {
  const { default: Anthropic } = await loadSdk();
  const client = new Anthropic({ apiKey: state.settings.apiKey, dangerouslyAllowBrowser: true });

  // Messages must alternate and start with the user.
  const messages = [];
  for (const m of state.chat) {
    if (!m.text) continue;
    const role = m.role === "user" ? "user" : "assistant";
    if (!messages.length && role !== "user") continue;
    if (messages.length && messages[messages.length - 1].role === role) {
      messages[messages.length - 1].content += `\n\n${m.text}`;
    } else {
      messages.push({ role, content: m.text });
    }
  }

  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: systemPrompt(state),
    messages,
  });
  let text = "";
  stream.on("text", (delta) => {
    text += delta;
    onText(text);
  });
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error("The assistant couldn't answer that one. Try rephrasing your question.");
  }
  return text;
}

export function friendlyError(err) {
  const status = err?.status;
  if (status === 401) return "The Claude API key looks invalid. Check it in Settings.";
  if (status === 429) return "The assistant is busy right now. Please try again in a moment.";
  if (status >= 500) return "The assistant service had a problem. Please try again.";
  if (err?.name === "APIConnectionError" || err instanceof TypeError) return "No internet connection — using the offline coach instead.";
  return err?.message || "Something went wrong.";
}

export function activitiesMentioned(text) {
  const t = text.toLowerCase();
  return ACTIVITIES.filter((a) => t.includes(a.title.toLowerCase())).map((a) => a.id);
}
