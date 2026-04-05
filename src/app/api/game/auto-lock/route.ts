import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';

export async function POST(req: Request) {
  try {
    const { slotNumber, gameId } = await req.json();

    if (!slotNumber || !gameId) {
      return NextResponse.json({ success: false, error: 'Missing parameters.' }, { status: 400 });
    }

    const gameStateDoc = await getDoc(doc(db, "system", "gameState"));
    if (!gameStateDoc.exists()) {
      return NextResponse.json({ success: false, error: 'No active game state.' }, { status: 404 });
    }
    
    const gameState = gameStateDoc.data();
    
    if (gameState.phase !== "active" && gameState.phase !== "active_a" && gameState.phase !== "active_b") {
      return NextResponse.json({ success: true, message: 'Phase already locked or inactive.' });
    }

    // Safety check timestamp on the server
    const nowSecs = Math.floor(Date.now() / 1000);
    const startSecs = gameState.timerStartedAt?.seconds || 0;
    const duration = gameState.timerDuration || 0;
    const endSecs = gameState.phaseEndsAt?.seconds || (startSecs > 0 ? startSecs + duration : 0);
    
    // We allow a small tolerance (e.g 2 seconds) just in case
    if (endSecs > 0 && nowSecs < endSecs - 2) {
       return NextResponse.json({ success: false, error: 'Timer has not expired yet.' }, { status: 400 });
    }

    const batch = writeBatch(db);
    
    // Step 1: Lock the phase
    const lockTarget = gameState.phase === "active_a" ? "locked_a" : gameState.phase === "active_b" ? "locked_b" : "locked";
    batch.update(doc(db, "system", "gameState"), { phase: lockTarget });

    // Step 2: Auto-submit for missing players
    // Get all alive players
    const playersSnap = await getDocs(collection(db, "players"));
    let penaltyValue = -10;
    
    // Retrieve configuration defaults
    if (gameState.gameSpecificConfig?.penaltyNoSubmit !== undefined) {
      penaltyValue = gameState.gameSpecificConfig.penaltyNoSubmit;
    }

    playersSnap.forEach((pDoc) => {
      const p = pDoc.data();
      if (p.status === "alive" && (p.currentSubmission === null || p.currentSubmission === undefined)) {
         
         let autoVal: any = null;
         if (gameId === "A1" || gameId === "BIDDING") autoVal = 50;
         else if (gameId === "A2") autoVal = "1-10"; // Random fallback range
         else if (gameId === "B7") autoVal = "ROUTE_1";
         else if (gameId === "C9") {
            if (gameState.phase === "active_a" || gameState.phase === "active_b") {
               autoVal = { type: "sequence", value: [0, 0, 0] };
            }
         } else if (gameId === "B8" || gameId === "C10" || gameId === "A4") {
            autoVal = "TIME_EXPIRED";
         }

         batch.update(pDoc.ref, {
            currentSubmission: autoVal,
            autoSubmitted: true,
            // We do not immediately apply points or eliminate here, just tag them
         });
      }
    });

    await batch.commit();

    return NextResponse.json({ success: true, message: 'Game successfully auto-locked and defaulted.' });
  } catch (error: any) {
    console.error("Auto-lock Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
