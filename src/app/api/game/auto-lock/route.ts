import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, serverTimestamp, runTransaction } from 'firebase/firestore';

export async function POST(req: Request) {
  try {
    const { slotNumber, gameId } = await req.json();

    if (!slotNumber || !gameId) {
      return NextResponse.json({ success: false, error: 'Missing parameters.' }, { status: 400 });
    }

    // Use Firestore transaction to prevent race conditions
    const result = await runTransaction(db, async (transaction) => {
      const gameStateRef = doc(db, "system", "gameState");
      const gameStateDoc = await transaction.get(gameStateRef);
      
      if (!gameStateDoc.exists()) {
        throw new Error("No active game state.");
      }
      
      const gameState = gameStateDoc.data();
      const activePhases = ["active", "active_a", "active_b"];
      
      if (!activePhases.includes(gameState.phase)) {
        return { alreadyLocked: true };
      }

      // Server-side timer validation using Firestore server timestamp
      // phaseEndsAt should be set by admin when starting timer
      const serverNow = Date.now(); // Use server time (close enough for this purpose)
      const startMs = gameState.timerStartedAt?.toMillis?.() ?? 0;
      const durationMs = (gameState.timerDuration || 0) * 1000;
      const endMs = startMs + durationMs;

      // Allow 3-second tolerance for network delays
      const TOLERANCE_MS = 3000;
      if (endMs > 0 && serverNow < endMs - TOLERANCE_MS) {
        throw new Error("Timer has not expired yet.");
      }

      const lockTarget = gameState.phase === "active_a" ? "locked_a" 
        : gameState.phase === "active_b" ? "locked_b" 
        : "locked";

      // Lock the phase
      transaction.update(gameStateRef, { 
        phase: lockTarget,
        lockedAt: serverTimestamp(),
      });

      // Auto-submit for missing players
      const playersRef = collection(db, "players");
      const playersSnap = await getDocs(playersRef);
      
      for (const pDoc of playersSnap.docs) {
        const p = pDoc.data();
        if (p.status === "alive" && (p.currentSubmission === null || p.currentSubmission === undefined)) {
          let autoVal: any = null;
          if (gameId === "A1" || gameId === "BIDDING") autoVal = 50;
          else if (gameId === "A2") autoVal = "1-10";
          else if (gameId === "B7") autoVal = 1;
          else if (gameId === "B8" || gameId === "C10" || gameId === "A4") autoVal = "TIME_EXPIRED";
          else if (gameId === "C9") {
            if (gameState.phase === "active_a") autoVal = { type: "sequence", value: [0, 0, 0] };
            else if (gameState.phase === "active_b") autoVal = { type: "guess", value: [0, 0, 0] };
          } else if (gameId === "SILENCE") autoVal = { answer: null, confidence: null, autoSubmitted: true };
          else if (gameId === "LEMONS") autoVal = { role: "none", autoSubmitted: true };

          transaction.update(pDoc.ref, {
            currentSubmission: autoVal,
            autoSubmitted: true,
          });
        }
      }

      return { alreadyLocked: false };
    });

    if (result.alreadyLocked) {
      return NextResponse.json({ success: true, message: 'Phase already locked or inactive.' });
    }

    return NextResponse.json({ success: true, message: 'Game successfully auto-locked and defaulted.' });
  } catch (error: any) {
    console.error("Auto-lock Error:", error);
    const message = error.message || "Unknown error";
    if (message === "Timer has not expired yet." || message === "No active game state." || message === "Phase already locked or inactive.") {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
