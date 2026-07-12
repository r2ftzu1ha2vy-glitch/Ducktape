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
  getDatabase, ref, set, onValue, update, remove, get,
  onDisconnect, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

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

/** Generates a random 4-digit numeric code as a string, e.g. "0472". */
export function randomCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

/** Host creates the room, sets the randomized code, and marks status waiting. */
export async function createRoom(code) {
  const doorCode = randomCode();
  await set(roomRef(code), {
    code: doorCode,
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
  return doorCode;
}

/** Player joins a role slot; auto-clears presence on disconnect. */
export async function joinAsRole(code, role, uid) {
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

/** Mute player attempts the door with a 4-digit guess. */
export async function attemptDoor(code, guess) {
  await set(roomRef(code, "doorAttempt"), {
    guess, ts: Date.now(), result: "pending",
  });
}

/** Resolves a door attempt against the true code; any client with the code can call this,
 *  but in practice only the blind client (who "walks into" the door) triggers it. */
export async function resolveDoorAttempt(code) {
  const snap = await get(roomRef(code));
  const data = snap.val();
  if (!data) return;
  const correct = data.doorAttempt.guess === data.code;
  await update(roomRef(code), {
    "doorAttempt/result": correct ? "correct" : "wrong",
    status: correct ? "won" : data.status,
  });
  return correct;
}
