import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp, updateDoc, increment } from "firebase/firestore";
import { PlayerData } from "./player-service";

// ==========================================
// V2 ARCHITECTURE - GAME SLOTS
// ==========================================

export type GamePhase = "lobby" | "active" | "locked" | "calculating" | "reveal" | "confirm" | "standby" | "game_over" | "active_a" | "locked_a" | "active_b" | "locked_b";
export type TieBreakerRule = "eliminate_all" | "eliminate_none" | "admin";
export type EliminationMode = "fixed" | "percentage" | "threshold" | "majority";

export interface GameSlotConfig {
  slotNumber: number;
  gameId: string;              // "A1" | "A2" | ... | "C10"
  gameName: string;
  status: "pending" | "active" | "completed";
  config: {
    timerSeconds: number;
    pointsFirst: number;
    pointsSecond: number;
    pointsThird: number;
    pointsSafe: number;
    pointsEliminated: number;
    eliminationMode: EliminationMode;
    eliminationValue: number;    // N players, or X%, or score cutoff
    advancementCount: number;    // how many move forward
    tieBreaker: TieBreakerRule;
    penaltyNoSubmit: number;
    bonusTopN: number;
    visibleToPlayers: boolean;
    gameSpecificConfig: any;     // game-specific params (e.g. penalty/bonus for A3, threshold for B7)
  };
}

export interface EventConfig {
  eventName: string;
  totalSlots: number;
  slots: GameSlotConfig[];
}

export interface GameState {
  currentSlot: number;
  currentGameId: string;
  currentRoundTitle?: string; // dynamic title for orchestration
  phase: GamePhase;
  timerDuration: number;
  timerStartedAt: any | null;
  phaseEndsAt: any | null;
  timerPaused: boolean;
  playersAlive: number;
  totalRegistered: number;
  submissionsCount: number;
  results: any | null;
  pendingEliminations: string[];
  displayMessage: string | null;
  emergencyPause: boolean;
  wildEntryOpen: boolean; // admin can open late registration mid-game
  roundType: "standard" | "semi-final" | "final";
  winnerId: string | null;
  customOptions?: string[];
  gameSpecificConfig?: any;
  gameHistory: Record<string, number>; // gameId -> playCount
  pairingComplete?: boolean;
  projectorPush?: {
    type: string;
    content: any;
    pushedAt: any;
  } | null;
}

// ==========================================
// SUBSCRIPTIONS
// ==========================================

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

export const subscribeToEventConfig = (callback: (config: EventConfig | null) => void) => {
  const docRef = doc(db, "system", "eventConfig");
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as EventConfig);
    } else {
      callback(null);
    }
  });
};

// ==========================================
// SUBMISSIONS
// ==========================================

export const submitGameInput = async (uid: string, name: string, slotNumber: number, gameId: string, value: any) => {
  // Update player doc to show they submitted this round intuitively for the dashboard
  const playerRef = doc(db, "players", uid);
  await updateDoc(playerRef, {
    currentSubmission: value,
    submittedAt: serverTimestamp()
  });

  // Add to submissions per slot
  const submissionRef = doc(db, "submissions", `${slotNumber}_${uid}`);
  await setDoc(submissionRef, {
    playerId: uid,
    playerName: name,
    slotNumber,
    gameId,
    value,
    submittedAt: serverTimestamp(),
    score: null,
    rank: null,
    pointsAwarded: null,
    eliminated: null
  });

  // Increment live submission counter in gameState
  const gameStateRef = doc(db, "system", "gameState");
  await updateDoc(gameStateRef, {
    submissionsCount: increment(1)
  });
};
