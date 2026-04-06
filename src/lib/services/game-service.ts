import { db } from "@/lib/firebase";
import { doc, onSnapshot, serverTimestamp, increment, writeBatch, getDoc } from "firebase/firestore";
import { checkRateLimit, checkIdempotency } from "./rate-limit";

// ==========================================
// VALID GAME PHASES (state machine)
// ==========================================

export const VALID_PHASE_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  lobby: ["active", "active_a", "image_flash", "phase_a_open", "roles_assigned", "pairing"],
  active: ["locked"],
  locked: ["calculating", "reveal"],
  calculating: ["reveal"],
  reveal: ["confirm"],
  confirm: ["standby", "game_over"],
  standby: ["active", "active_a", "active_b", "lobby"],
  game_over: [],
  active_a: ["locked_a"],
  locked_a: ["active_b"],
  active_b: ["locked_b"],
  locked_b: ["calculating"],
  // B8 phases
  image_flash: ["voting_open"],
  voting_open: ["voting_locked", "confidence"],
  voting_locked: ["confidence", "confidence_locked", "calculating"],
  confidence: ["confidence_locked"],
  confidence_locked: ["calculating"],
  // C9 phases
  phase_a_open: ["phase_a_locked"],
  phase_a_locked: ["phase_b_open"],
  phase_b_open: ["phase_b_locked"],
  phase_b_locked: ["calculating"],
  // LEMONS phases
  roles_assigned: ["card_flash"],
  card_flash: ["trading_open"],
  trading_open: ["trading_locked"],
  trading_locked: ["calculating"],
  pairing: ["phase_a_open"],
};

export function isValidPhaseTransition(from: GamePhase, to: GamePhase): boolean {
  return VALID_PHASE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ==========================================
// V2 ARCHITECTURE - GAME SLOTS
// ==========================================

export type GamePhase = "lobby" | "active" | "locked" | "calculating" | "reveal" | "confirm" | "standby" | "game_over" | "active_a" | "locked_a" | "active_b" | "locked_b" | "image_flash" | "voting_open" | "voting_locked" | "confidence" | "confidence_locked" | "phase_a_open" | "phase_a_locked" | "phase_b_open" | "phase_b_locked" | "roles_assigned" | "card_flash" | "trading_open" | "trading_locked" | "pairing";
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
  // B8 Information Cascade fields
  b8Config?: {
    questionId?: string;
    customQuestion?: string;
    correctAnswer?: "A" | "B";
    optionALabel?: string;
    optionBLabel?: string;
    imageFlashSeconds?: number;
    votingSeconds?: number;
    confidenceEnabled?: boolean;
    confidenceSeconds?: number;
    fakeMajorityEnabled?: boolean;
    fakeMajorityBiasToward?: "A" | "B";
    fakeMajorityStartPercent?: number;
  };
  b8Results?: {
    totalVoters?: number;
    votesA?: number;
    votesB?: number;
    nullVotes?: number;
    correctAnswer?: "A" | "B";
    eliminatedCount?: number;
    overconfidentCount?: number;
  } | null;
  b8RevealStep?: number;
  imageFlashStartedAt?: any | null;
  votingStartedAt?: any | null;
  confidenceStartedAt?: any | null;
  // C9 Sequence Match fields
  sequenceConfig?: {
    phaseASeconds?: number;
    phaseBSeconds?: number;
    showOpponentName?: boolean;
    exactMatchBonus?: number;
    winnerPoints?: number;
    loserPoints?: number;
    tieRule?: "admin_decides" | "both_eliminated" | "both_safe";
  };
  sequencePairsCreated?: boolean;
  sequenceByePlayerId?: string | null;
  sequencePhaseAStartedAt?: any | null;
  sequencePhaseBStartedAt?: any | null;
  sequenceTiedPairs?: string[];
  sequenceRevealStep?: number;
  sequenceRevealedPairId?: string | null;
  // LEMONS Market of Lemons fields
  marketConfig?: {
    numSellers?: number;
    numBuyers?: number;
    goldPct?: number;
    sellerPct?: number;
    cardFlashSeconds?: number;
    tradingSeconds?: number;
  };
  marketRoles?: {
    sellers?: string[];
    buyers?: string[];
    goldCards?: string[];
    leadCards?: string[];
  };
  tradingStartedAt?: any | null;
  revealStep?: number;
  // Allow any additional dynamic fields
  [key: string]: any;
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
// SUBMISSIONS (with rate limiting + idempotency)
// ==========================================

export interface SubmitResult {
  success: boolean;
  error?: string;
  duplicate?: boolean;
  existingValue?: any;
}

export const submitGameInput = async (
  uid: string,
  name: string,
  slotNumber: number,
  gameId: string,
  value: any
): Promise<SubmitResult> => {
  // 1. Check idempotency — prevent duplicate submissions for same slot
  const { duplicate, existingValue } = await checkIdempotency(uid, slotNumber, gameId);
  if (duplicate) {
    return { success: false, error: "Submission already received for this round.", duplicate: true, existingValue };
  }

  // 2. Check rate limit
  const { allowed, reason } = await checkRateLimit(uid, slotNumber);
  if (!allowed) {
    return { success: false, error: reason };
  }

  // 3. Verify game is in an active submission phase
  const gameStateRef = doc(db, "system", "gameState");
  const gameStateSnap = await getDoc(gameStateRef);
  if (!gameStateSnap.exists()) {
    return { success: false, error: "No active game." };
  }
  
  const gs = gameStateSnap.data() as GameState;
  const activePhases = ["active", "active_a", "active_b", "open_a", "open_b"];
  if (!activePhases.includes(gs.phase)) {
    return { success: false, error: `Cannot submit in phase: ${gs.phase}. Submissions are closed.` };
  }
  
  if (gs.currentSlot !== slotNumber) {
    return { success: false, error: "Slot mismatch. Please refresh." };
  }

  // 4. Check if player already submitted for this slot (guard)
  const submissionRef = doc(db, "submissions", `${slotNumber}_${uid}`);
  const existingSnap = await getDoc(submissionRef);
  if (existingSnap.exists()) {
    // Already submitted — return success with existing value
    return { success: true, duplicate: true, existingValue: existingSnap.data().value };
  }

  // 5. Atomic write: set idempotency key + submission + player update + counter increment
  const batch = writeBatch(db);
  
  // Set idempotency key first
  batch.set(doc(db, "idempotencyKeys", `${slotNumber}_${uid}`), {
    gameId,
    value,
    submittedAt: serverTimestamp(),
    slotNumber,
  }, { merge: true });

  // Update player submission status
  batch.update(doc(db, "players", uid), {
    currentSubmission: value,
    submittedAt: serverTimestamp(),
  });

  // Increment submissions count
  batch.update(doc(db, "system", "gameState"), {
    submissionsCount: increment(1),
  });

  // Create submission document
  batch.set(submissionRef, {
    playerId: uid,
    playerName: name,
    slotNumber,
    gameId,
    value,
    submittedAt: serverTimestamp(),
    score: null,
    rank: null,
    pointsAwarded: null,
    eliminated: null,
  });

  await batch.commit();
  
  return { success: true };
};
