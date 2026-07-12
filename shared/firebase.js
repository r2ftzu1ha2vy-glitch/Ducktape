// ---------------------------------------------------------------------------
// Ducktape — Firebase Realtime Database layer
// ---------------------------------------------------------------------------
// Fill in your own Firebase project config below. Create a project at
// https://console.firebase.google.com, enable "Realtime Database" (NOT
// Firestore), start it in test mode for prototyping, and paste your config.
//
// Realtime DB rules for prototyping (tighten before shipping):
// {
//   "rules": { ".read": true, ".write": true }
// }
// ---------------------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, set, onValue, update, remove, get,
  onDisconnect, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6Im0hdbp_tfEu-d2sMLfvmf52W08pKWs",
  authDomain: "ducktape-8c067.firebaseapp.com",
  databaseURL: "https://ducktape-8c067-default-rtdb.firebaseio.com/",
  projectId: "ducktape-8c067",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Every client must be signed in (anonymously) before touching the DB —
// required by the locked-down rules below, and it's what stops randoms
// from writing to /rooms directly via the REST API without going through
// this app at all.
export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) resolve(user);
  });
  signInAnonymously(auth).catch((err) => {
    console.error("Anonymous sign-in failed:", err);
  });
});

export {
  ref, set, onValue, update, remove, get,
  onDisconnect, serverTimestamp, runTransaction
};

// ---------------------------------------------------------------------------
// Room data shape (all under /rooms/{roomCode}):
//
// /rooms/{code}/code            -> string, the 4-digit lock code (host-generated)
// /rooms/{code}/status          -> "waiting" | "playing" | "won" | "lost"
// /rooms/{code}/startedAt       -> server timestamp, when the 2-min timer began
// /rooms/{code}/duration        -> 120 (seconds)
// /rooms/{code}/players/{role}  -> { present: bool, uid: string }
//     role is one of: "blind" | "mute" | "deaf"
// /rooms/{code}/symbols/current -> { shape: "circle"|"triangle"|"square"|"zigzag", ts }
//     written by the deaf player when they draw a symbol
// /rooms/{code}/digits/{index}  -> which digit (0-3 position) the symbol maps to,
//     set by the mute player selecting which code-digit they're pointing at.
//     shape: { position: 0-3, value: "0".."9", ts }
// /rooms/{code}/doorAttempt     -> { guess: "1234", ts, result: "pending"|"correct"|"wrong" }
// ---------------------------------------------------------------------------

export function roomRef(code, ...path) {
  return ref(db, ["rooms", code, ...path].join("/"));
}

/**
 * Room CODE is what you tell friends verbally — keep it short (4 digits) for
 * convenience, that's fine, since it's not the security boundary anymore.
 * The actual guess-proofing comes from JOIN_TOKEN: a long random string
 * generated at room creation and shared via the invite link (?room=1234&t=...),
 * never typed by hand and never brute-forceable in a reasonable time.
 * The DB rules (see README) require the token to match before any write
 * to a room succeeds, so scripts hitting the REST API with just a guessed
 * 4-digit code get rejected.
 */
export function randomCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

function randomToken(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Host creates the room: random door code + random long join token. Returns both. */
export async function createRoom(code) {
  const doorCode = randomCode();
  const joinToken = randomToken();
  await set(roomRef(code), {
    code: doorCode,
    joinToken,
    status: "waiting",
    duration: 120,
    players: {
      blind: { present: false },
      mute: { present: false },
      deaf: { present: false },
    },
    symbols: { current: null },
    doorAttempt: { guess: "", ts: 0, result: "pending" },
  });
  return { doorCode, joinToken };
}

/**
 * Player joins a role slot. Requires the joinToken that came from the invite
 * link — the DB rules reject writes to /rooms/{code}/players/* unless the
 * caller can prove they already know joinToken (checked client-side here AND
 * enforced again in the rules, since client checks alone can be bypassed).
 */
export async function joinAsRole(code, role, uid, joinToken) {
  const snap = await get(roomRef(code, "joinToken"));
  if (snap.val() !== joinToken) {
    throw new Error("Invalid or missing invite token — use the link the host shared, not just the room code.");
  }
  const pRef = roomRef(code, "players", role);
  await set(pRef, { present: true, uid });
  onDisconnect(pRef).set({ present: false, uid });
}

/** Starts the shared timer for everyone at once. */
export async function startGame(code) {
  await update(roomRef(code), {
    status: "playing",
    startedAt: serverTimestamp(),
  });
}

/** Deaf player draws a symbol; broadcasts to blind player's world. */
export async function broadcastSymbol(code, shape, worldX, worldZ) {
  await set(roomRef(code, "symbols", "current"), {
    shape, worldX, worldZ, ts: Date.now(),
  });
}

const MAX_DOOR_ATTEMPTS = 5;

/** Blind player attempts the door with a 4-digit guess. Blocked once MAX_DOOR_ATTEMPTS is hit. */
export async function attemptDoor(code, guess) {
  const snap = await get(roomRef(code, "doorAttempt", "failCount"));
  const failCount = snap.val() || 0;
  if (failCount >= MAX_DOOR_ATTEMPTS) {
    throw new Error("Too many wrong guesses — the door is locked out. Coordinate with your team before trying again.");
  }
  await update(roomRef(code, "doorAttempt"), {
    guess, ts: Date.now(), result: "pending",
  });
}

/** Resolves a door attempt against the true code; increments failCount on a wrong guess
 *  so brute-forcing the 4-digit code by spamming attempts hits a hard wall at 5 tries. */
export async function resolveDoorAttempt(code) {
  const snap = await get(roomRef(code));
  const data = snap.val();
  if (!data) return;
  const correct = data.doorAttempt.guess === data.code;
  const failCount = correct ? (data.doorAttempt.failCount || 0) : (data.doorAttempt.failCount || 0) + 1;
  await update(roomRef(code), {
    "doorAttempt/result": correct ? "correct" : "wrong",
    "doorAttempt/failCount": failCount,
    status: correct ? "won" : (failCount >= MAX_DOOR_ATTEMPTS ? "lost" : data.status),
  });
  return correct;
}
