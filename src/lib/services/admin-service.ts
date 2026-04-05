import { db } from "@/lib/firebase";
import { doc, updateDoc, setDoc, getDocs, collection, query, where, writeBatch, increment, serverTimestamp, getDoc, addDoc } from "firebase/firestore";
import { GameState, EventConfig, isValidPhaseTransition } from "./game-service";

// ==========================================
// ADMIN AUDIT LOGGING
// ==========================================

export interface AdminAuditEntry {
  action: string;
  adminId: string;
  adminEmail?: string;
  timestamp?: any;
  details: Record<string, any>;
  gameState?: Partial<GameState>;
}

export const logAdminAction = async (entry: AdminAuditEntry) => {
  try {
    await addDoc(collection(db, "adminAuditLog"), {
      ...entry,
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.error("Failed to write audit log:", e);
  }
};

// ==========================================
// INPUT VALIDATION HELPERS
// ==========================================

export function validateTimerDuration(duration: number): { valid: boolean; error?: string } {
  if (typeof duration !== "number" || isNaN(duration)) {
    return { valid: false, error: "Timer duration must be a number." };
  }
  if (duration < 5) {
    return { valid: false, error: "Timer must be at least 5 seconds." };
  }
  if (duration > 600) {
    return { valid: false, error: "Timer cannot exceed 10 minutes (600 seconds)." };
  }
  return { valid: true };
}

export function validateEliminationCount(count: number, alivePlayers: number): { valid: boolean; error?: string } {
  if (typeof count !== "number" || isNaN(count)) {
    return { valid: false, error: "Elimination count must be a number." };
  }
  if (count < 0) {
    return { valid: false, error: "Elimination count cannot be negative." };
  }
  if (count > alivePlayers) {
    return { valid: false, error: `Cannot eliminate ${count} players — only ${alivePlayers} are alive.` };
  }
  return { valid: true };
}

export function validateMultiplier(multiplier: number): { valid: boolean; error?: string } {
  if (typeof multiplier !== "number" || isNaN(multiplier)) {
    return { valid: false, error: "Multiplier must be a number." };
  }
  if (multiplier <= 0 || multiplier > 2) {
    return { valid: false, error: "Multiplier should be between 0 and 2." };
  }
  return { valid: true };
}

export function validateThreshold(threshold: number, maxPlayers: number): { valid: boolean; error?: string } {
  if (typeof threshold !== "number" || isNaN(threshold)) {
    return { valid: false, error: "Threshold must be a number." };
  }
  if (threshold < 2) {
    return { valid: false, error: "Threshold must be at least 2." };
  }
  if (threshold > maxPlayers) {
    return { valid: false, error: `Threshold (${threshold}) cannot exceed total players (${maxPlayers}).` };
  }
  return { valid: true };
}

export function validatePoints(points: number): { valid: boolean; error?: string } {
  if (typeof points !== "number" || isNaN(points)) {
    return { valid: false, error: "Points must be a number." };
  }
  if (Math.abs(points) > 10000) {
    return { valid: false, error: "Points value too extreme." };
  }
  return { valid: true };
}

// ==========================================
// ADMIN ACTIONS WITH VALIDATION
// ==========================================

export const initializeGameState = async () => {
  const docRef = doc(db, "system", "gameState");
  const initialState: GameState = {
    currentSlot: 1,
    currentGameId: "A1",
    currentRoundTitle: "Trial 1",
    phase: "lobby",
    timerDuration: 60,
    timerStartedAt: null,
    phaseEndsAt: null,
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

export const nukeDatabase = async (adminId?: string) => {
  const batch = writeBatch(db);
  
  const pSnap = await getDocs(collection(db, "players"));
  pSnap.forEach((d) => batch.delete(d.ref));
  
  const sSnap = await getDocs(collection(db, "submissions"));
  sSnap.forEach((d) => batch.delete(d.ref));

  const lSnap = await getDocs(collection(db, "lemonAssignments"));
  lSnap.forEach((d) => batch.delete(d.ref));

  const tSnap = await getDocs(collection(db, "marketTrades"));
  tSnap.forEach((d) => batch.delete(d.ref));

  const iSnap = await getDocs(collection(db, "idempotencyKeys"));
  iSnap.forEach((d) => batch.delete(d.ref));

  const rSnap = await getDocs(collection(db, "rateLimits"));
  rSnap.forEach((d) => batch.delete(d.ref));
  
  await batch.commit();

  await initializeGameState();

  await logAdminAction({
    action: "NUKE_DATABASE",
    adminId: adminId || "unknown",
    details: { playerCount: pSnap.size, submissionCount: sSnap.size },
  });
};

export const updateGameState = async (
  updates: Partial<GameState>,
  adminId?: string,
  actionName?: string
) => {
  // Validate phase transitions
  if (updates.phase) {
    const gameStateRef = doc(db, "system", "gameState");
    const snap = await getDoc(gameStateRef);
    if (snap.exists()) {
      const current = snap.data() as GameState;
      if (!isValidPhaseTransition(current.phase, updates.phase)) {
        console.warn(
          `Invalid phase transition: ${current.phase} → ${updates.phase}. ` +
          `Valid transitions from ${current.phase}: ${JSON.stringify([current.phase])}`
        );
      }
    }
  }

  const docRef = doc(db, "system", "gameState");
  await updateDoc(docRef, updates);

  if (actionName && adminId) {
    await logAdminAction({
      action: actionName,
      adminId,
      details: updates,
      gameState: updates,
    });
  }
};

export const emergencyPauseToggle = async (currentState: boolean, adminId?: string) => {
  await updateGameState({
    emergencyPause: !currentState,
    displayMessage: !currentState ? "Emergency Pause. Stand by." : null
  }, adminId, "EMERGENCY_PAUSE_TOGGLE");
};

export const confirmEliminations = async (
  playerIds: string[],
  adminId?: string
): Promise<{ success: boolean; error?: string }> => {
  // Validate elimination count
  const qAlive = query(collection(db, "players"), where("status", "==", "alive"));
  const aliveSnap = await getDocs(qAlive);
  const aliveCount = aliveSnap.size;
  const { valid, error } = validateEliminationCount(playerIds.length, aliveCount);
  if (!valid) {
    return { success: false, error };
  }

  const batch = writeBatch(db);
  for (const uid of playerIds) {
    const pRef = doc(db, "players", uid);
    batch.update(pRef, { status: "eliminated", eliminatedAt: serverTimestamp() });
  }

  batch.update(doc(db, "system", "gameState"), {
    pendingEliminations: [],
  });

  await batch.commit();

  const newAliveSnap = await getDocs(qAlive);
  await updateGameState(
    { playersAlive: newAliveSnap.size },
    adminId,
    "CONFIRM_ELIMINATIONS"
  );

  await logAdminAction({
    action: "CONFIRM_ELIMINATIONS",
    adminId: adminId || "unknown",
    details: { eliminatedIds: playerIds, count: playerIds.length },
  });

  return { success: true };
};

export const activateWaitingPlayers = async (adminId?: string) => {
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
  await updateGameState(
    { playersAlive: snapAlive.size },
    adminId,
    "ACTIVATE_WAITING_PLAYERS"
  );
};

export const startTimer = async (
  duration: number,
  adminId?: string
): Promise<{ success: boolean; error?: string }> => {
  const { valid, error } = validateTimerDuration(duration);
  if (!valid) {
    return { success: false, error };
  }

  const { serverTimestamp: ts } = await import("firebase/firestore");
  await updateGameState({
    timerDuration: duration,
    timerStartedAt: ts(),
    timerPaused: false,
    submissionsCount: 0,
  }, adminId, "START_TIMER");

  return { success: true };
};

export interface PlayerRoundUpdate {
  uid: string;
  status: "alive" | "eliminated";
  pointsDelta: number;
}

export const finalizeRoundResults = async (
  updates: PlayerRoundUpdate[],
  isFinalRound: boolean = false,
  adminId?: string
): Promise<{ success: boolean; error?: string }> => {
  // Validate
  for (const update of updates) {
    const { valid, error } = validatePoints(update.pointsDelta);
    if (!valid) {
      return { success: false, error: `Invalid points for ${update.uid}: ${error}` };
    }
  }

  const batch = writeBatch(db);
  
  let winnerId: string | null = null;
  if (isFinalRound) {
    const maxPoints = Math.max(...updates.map(u => u.pointsDelta));
    const leads = updates.filter(u => u.pointsDelta === maxPoints);
    if (leads.length > 1) {
      return { success: false, error: "TIE_DETECTED: Multiple players have the highest score. Start another round to break the tie." };
    }
    winnerId = leads[0].uid;
  }

  for (const update of updates) {
    const pRef = doc(db, "players", update.uid);
    batch.update(pRef, {
      status: update.status,
      points: increment(update.pointsDelta),
      currentSubmission: null,
      submittedAt: null,
    });
  }

  const gameStateRef = doc(db, "system", "gameState");
  batch.update(gameStateRef, {
    phase: isFinalRound ? "game_over" : "standby",
    winnerId: winnerId,
    results: null,
    displayMessage: isFinalRound ? "THE GAMES HAVE ENDED." : "Round Finalized. Prepare for the next trial.",
    submissionsCount: 0,
    currentSlot: isFinalRound ? 99 : increment(1),
  });

  await batch.commit();

  const qAlive = query(collection(db, "players"), where("status", "==", "alive"));
  const snapAlive = await getDocs(qAlive);
  await updateGameState(
    { playersAlive: snapAlive.size },
    adminId,
    isFinalRound ? "FINALIZE_GAME_OVER" : "FINALIZE_ROUND"
  );

  await logAdminAction({
    action: isFinalRound ? "FINALIZE_GAME_OVER" : "FINALIZE_ROUND",
    adminId: adminId || "unknown",
    details: { updateCount: updates.length, isFinalRound, winnerId },
  });

  return { success: true };
};

export const resetToSlotOne = async (adminId?: string) => {
  await updateGameState({
    currentSlot: 1,
    phase: "standby",
    displayMessage: "Event Slot Reset to 1. All previous slot data remains in DB but UI shifted.",
  }, adminId, "RESET_TO_SLOT_ONE");
};
