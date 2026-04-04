import { db } from "@/lib/firebase";
import { doc, updateDoc, setDoc, getDocs, collection, query, where, writeBatch } from "firebase/firestore";
import { GameState, EventConfig } from "./game-service";

export const initializeGameState = async () => {
  const docRef = doc(db, "system", "gameState");
  const initialState: GameState = {
    currentSlot: 1,
    currentGameId: "A1",
    phase: "lobby",
    timerDuration: 60,
    timerStartedAt: null,
    timerPaused: false,
    playersAlive: 0,
    totalRegistered: 0,
    submissionsCount: 0,
    results: null,
    pendingEliminations: [],
    displayMessage: null,
    emergencyPause: false
  };
  await setDoc(docRef, initialState, { merge: true });
};

export const saveEventConfig = async (config: EventConfig) => {
  const docRef = doc(db, "system", "eventConfig");
  await setDoc(docRef, config);
};

export const nukeDatabase = async () => {
  const batch = writeBatch(db);
  
  // Nuke Players
  const pSnap = await getDocs(collection(db, "players"));
  pSnap.forEach((d) => batch.delete(d.ref));
  
  // Nuke Submissions
  const sSnap = await getDocs(collection(db, "submissions"));
  sSnap.forEach((d) => batch.delete(d.ref));
  
  await batch.commit();

  // Reset GameState
  await initializeGameState();
};

export const updateGameState = async (updates: Partial<GameState>) => {
  const docRef = doc(db, "system", "gameState");
  await updateDoc(docRef, updates);
};

export const emergencyPauseToggle = async (currentState: boolean) => {
  await updateGameState({
    emergencyPause: !currentState,
    displayMessage: !currentState ? "Emergency Pause. Stand by." : null
  });
};

export const confirmEliminations = async (playerIds: string[]) => {
  const batch = writeBatch(db);

  for (const uid of playerIds) {
    const pRef = doc(db, "players", uid);
    batch.update(pRef, { status: "eliminated" });
  }

  await batch.commit();

  // Simple recalc of alive
  const q = query(collection(db, "players"), where("status", "==", "alive"));
  const snap = await getDocs(q);
  await updateGameState({ playersAlive: snap.size, pendingEliminations: [] });
};

export const startTimer = async (duration: number) => {
  const { serverTimestamp } = await import("firebase/firestore");
  await updateGameState({
    timerDuration: duration,
    timerStartedAt: serverTimestamp()
  });
};
