import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { PlayerData } from "./player-service";

export interface GameState {
  currentGame: number;
  currentRound: number;
  phase: "lobby" | "active" | "locked" | "reveal" | "eliminated" | "standby";
  timerDuration: number;
  timerStartedAt: any | null;
  timerPaused: boolean;
  playersAlive: number;
  totalPlayers: number;
  results: {
    average: number;
    target: number;
    eliminatedPlayerIds: string[];
  } | null;
  displayMessage: string | null;
}

export const subscribeToGameState = (callback: (state: GameState | null) => void) => {
  const docRef = doc(db, "system", "gameState");
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as GameState);
    } else {
      callback(null);
    }
  });
};

export const subscribeToPlayer = (uid: string, callback: (player: PlayerData | null) => void) => {
  const docRef = doc(db, "players", uid);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as PlayerData);
    } else {
      callback(null);
    }
  });
};

export const submitNumber = async (uid: string, name: string, gameId: number, value: number) => {
  const { setDoc, serverTimestamp, updateDoc } = await import("firebase/firestore");
  
  // Update player doc
  const playerRef = doc(db, "players", uid);
  await updateDoc(playerRef, {
    currentSubmission: value,
    submittedAt: serverTimestamp()
  });

  // Add to submissions
  const submissionRef = doc(db, "submissions", `${gameId}_${uid}`);
  await setDoc(submissionRef, {
    playerId: uid,
    playerName: name,
    gameId,
    value,
    submittedAt: serverTimestamp(),
    distance: null
  });
};
