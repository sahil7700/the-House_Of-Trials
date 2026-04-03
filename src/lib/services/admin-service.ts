import { db } from "@/lib/firebase";
import { doc, updateDoc, setDoc, getDocs, collection, query, where, writeBatch } from "firebase/firestore";
import { GameState } from "./game-service";

export const initializeGameState = async () => {
  const docRef = doc(db, "system", "gameState");
  const initialState: GameState = {
    currentGame: 2, // Defaulting to 2/3 average game
    currentRound: 1,
    phase: "lobby",
    timerDuration: 60,
    timerStartedAt: null,
    timerPaused: false,
    playersAlive: 0,
    totalPlayers: 0,
    results: null,
    displayMessage: null
  };
  await setDoc(docRef, initialState, { merge: true });
};

export const updateGameState = async (updates: Partial<GameState>) => {
  const docRef = doc(db, "system", "gameState");
  await updateDoc(docRef, updates);
};

export const emergencyPause = async () => {
  await updateGameState({
    phase: "standby",
    displayMessage: "Emergency Pause. Stand by."
  });
};

export const confirmEliminations = async (playerIds: string[]) => {
  const batch = writeBatch(db);
  let newlyEliminated = 0;

  for (const uid of playerIds) {
    const pRef = doc(db, "players", uid);
    batch.update(pRef, { status: "eliminated" });
    newlyEliminated++;
  }

  // Also decrement players alive in gameState
  // Need to use transaction or just recalculate it later, but simple update for now:
  await batch.commit();

  // Simple recalc of alive
  const q = query(collection(db, "players"), where("status", "==", "alive"));
  const snap = await getDocs(q);
  await updateGameState({ playersAlive: snap.size });
};

export const startTimer = async (duration: number) => {
  const { serverTimestamp } = await import("firebase/firestore");
  await updateGameState({
    timerDuration: duration,
    timerStartedAt: serverTimestamp()
  });
};
