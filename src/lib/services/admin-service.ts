import { db } from "@/lib/firebase";
import { doc, updateDoc, setDoc, getDocs, collection, query, where, writeBatch, increment } from "firebase/firestore";
import { GameState, EventConfig } from "./game-service";

export const initializeGameState = async () => {
  const docRef = doc(db, "system", "gameState");
  const initialState: GameState = {
    currentSlot: 1,
    currentGameId: "A1",
    currentRoundTitle: "Trial 1",
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
    emergencyPause: false,
    wildEntryOpen: false,
    roundType: "standard",
    winnerId: null,
    gameHistory: {}
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

export const activateWaitingPlayers = async () => {
  const q = query(collection(db, "players"), where("status", "==", "waiting"));
  const snap = await getDocs(q);
  
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    batch.update(d.ref, { status: "alive" });
  });
  await batch.commit();

  const qAlive = query(collection(db, "players"), where("status", "==", "alive"));
  const snapAlive = await getDocs(qAlive);
  await updateGameState({ playersAlive: snapAlive.size });
};

export const startTimer = async (duration: number) => {
  const { serverTimestamp } = await import("firebase/firestore");
  await updateGameState({
    timerDuration: duration,
    timerStartedAt: serverTimestamp()
  });
};

export interface PlayerRoundUpdate {
  uid: string;
  status: "alive" | "eliminated";
  pointsDelta: number;
}

export const finalizeRoundResults = async (updates: PlayerRoundUpdate[], isFinalRound: boolean = false) => {
  const batch = writeBatch(db);
  
  let winnerId: string | null = null;
  if (isFinalRound) {
    const maxPoints = Math.max(...updates.map(u => u.pointsDelta));
    const leads = updates.filter(u => u.pointsDelta === maxPoints);
    if (leads.length > 1) {
      throw new Error("TIE_DETECTED: Multiple players have the highest score. start another round to break the tie.");
    }
    winnerId = leads[0].uid;
  }

  for (const update of updates) {
    const pRef = doc(db, "players", update.uid);
    batch.update(pRef, {
      status: update.status,
      points: increment(update.pointsDelta),
      currentSubmission: null,
      submittedAt: null
    });
  }

  // Set phase to standby after processing all updates
  const gameStateRef = doc(db, "system", "gameState");
  batch.update(gameStateRef, {
    phase: isFinalRound ? "game_over" : "standby",
    winnerId: winnerId,
    results: null,
    displayMessage: isFinalRound ? "THE GAMES HAVE ENDED." : "Round Finalized. Prepare for the next trial.",
    submissionsCount: 0,
    currentSlot: isFinalRound ? 99 : increment(1)
  });

  await batch.commit();

  // Recalc alive for safety
  const qAlive = query(collection(db, "players"), where("status", "==", "alive"));
  const snapAlive = await getDocs(qAlive);
  await updateGameState({ playersAlive: snapAlive.size });
};
export const resetToSlotOne = async () => {
  await updateGameState({
    currentSlot: 1,
    phase: "standby",
    displayMessage: "Event Slot Reset to 1. All previous slot data remains in DB but UI shifted.",
  });
};
