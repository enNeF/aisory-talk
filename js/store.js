// Local, on-device persistence. Nothing leaves the device unless the parent
// turns on the Claude assistant in Settings.
import { ACTIVITIES } from "./data.js";

const KEY = "aisory.v1";

// crypto.randomUUID needs a secure context (HTTPS/localhost); fall back on plain HTTP.
const uid = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const DEFAULT_STATE = {
  profile: null, // { parentName, childName, ageMonths, concerns: [], goalMin }
  logs: [],
  chat: [],
  settings: { apiKey: "" },
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked — the app keeps working for this session.
  }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get: () => state,
  subscribe: (fn) => listeners.add(fn),

  setProfile(profile) {
    state.profile = { goalMin: 10, concerns: [], ...state.profile, ...profile };
    save();
  },

  addLog(entry) {
    const log = {
      id: uid(),
      createdAt: new Date().toISOString(),
      speech: 0,
      gestures: 0,
      engagement: 70,
      notes: "",
      ...entry,
    };
    state.logs.unshift(log);
    state.logs.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    save();
    return log;
  },

  deleteLog(id) {
    state.logs = state.logs.filter((l) => l.id !== id);
    save();
  },

  pushChat(msg) {
    state.chat.push({ ...msg, at: Date.now() });
    state.chat = state.chat.slice(-60);
    save();
  },

  updateLastChat(text) {
    const last = state.chat[state.chat.length - 1];
    if (last) last.text = text;
    save();
  },

  clearChat() {
    state.chat = [];
    save();
  },

  setApiKey(apiKey) {
    state.settings.apiKey = apiKey.trim();
    save();
  },

  exportJSON() {
    const { settings, ...rest } = state; // never export the API key
    return JSON.stringify(rest, null, 2);
  },

  reset() {
    state = structuredClone(DEFAULT_STATE);
    save();
  },

  // Fills the app with a realistic week for exhibition demos.
  loadDemo() {
    state = structuredClone(DEFAULT_STATE);
    state.profile = {
      parentName: "Mom",
      childName: "Luna",
      ageMonths: 26,
      concerns: ["speech", "eye"],
      goalMin: 10,
    };
    const picks = [
      // [daysAgo, activityId, minutes, mood, speech, gestures, engagement]
      [13, "peekaboo", 8, "happy", 1, 3, 60],
      [12, "animal-sounds", 10, "calm", 2, 2, 55],
      [10, "bubble-pop-name", 8, "excited", 1, 4, 70],
      [9, "story-time", 10, "fussy", 1, 1, 40],
      [8, "ball-turns", 6, "happy", 0, 3, 65],
      [6, "musical-imitation", 10, "happy", 3, 2, 75],
      [6, "texture-book", 6, "calm", 0, 2, 60],
      [5, "peekaboo", 10, "excited", 2, 4, 85],
      [4, "snack-choices", 8, "happy", 4, 3, 80],
      [3, "story-time", 12, "calm", 3, 2, 70],
      [2, "mirror-faces", 8, "fussy", 1, 1, 45],
      [1, "musical-imitation", 10, "excited", 5, 3, 90],
      [0, "xylophone", 3, "happy", 0, 2, 80],
    ];
    const now = new Date();
    for (const [ago, id, minutes, mood, speech, gestures, engagement] of picks) {
      const a = ACTIVITIES.find((x) => x.id === id);
      const d = new Date(now);
      d.setDate(d.getDate() - ago);
      d.setHours(10 + (ago % 6), 30, 0, 0);
      state.logs.push({
        id: uid(),
        createdAt: d.toISOString(),
        date: dateKey(d),
        name: a.title,
        activityId: id,
        category: a.category,
        duration: minutes,
        mood,
        speech,
        gestures,
        engagement,
        notes: "",
      });
    }
    state.logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    save();
  },
};

export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
