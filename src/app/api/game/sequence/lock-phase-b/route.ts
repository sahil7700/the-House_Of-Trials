import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, collection, getDocs, query, where, writeBatch } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber } = await req.json();

    if (!slotNumber) {
      return NextResponse.json({ error: "slotNumber is required" }, { status: 400 });
    }

    const pairsSnap = await getDocs(
      query(collection(db, "sequencePairs"), where("slotNumber", "==", Number(slotNumber)))
    );
    const playersSnap = await getDocs(query(collection(db, "players"), where("status", "==", "alive")));

    const playerMap: Record<string, any> = {};
    playersSnap.docs.forEach(d => { playerMap[d.id] = d.data(); });

    const batch = writeBatch(db);
    let autoGuessedCount = 0;

    for (const pairDoc of pairsSnap.docs) {
      const pair = pairDoc.data();
      if (pair.byePair) continue;

      let updated = false;
      const updates: Record<string, any> = {};

      if (!pair.playerA_guess) {
        const pA = playerMap[pair.playerAId];
        const guess = pA?.currentSubmission?.type === "guess" ? pA.currentSubmission.value : [0, 0, 0];
        updates.playerA_guess = guess;
        updates.playerA_guessLockedAt = serverTimestamp();
        updates.playerA_autoGuessed = !pA?.currentSubmission;
        autoGuessedCount++;
        updated = true;
      }

      if (!pair.playerB_guess) {
        const pB = playerMap[pair.playerBId];
        const guess = pB?.currentSubmission?.type === "guess" ? pB.currentSubmission.value : [0, 0, 0];
        updates.playerB_guess = guess;
        updates.playerB_guessLockedAt = serverTimestamp();
        updates.playerB_autoGuessed = !pB?.currentSubmission;
        autoGuessedCount++;
        updated = true;
      }

      if (updated) {
        batch.update(pairDoc.ref, updates);
      }
    }

    batch.update(doc(db, "system", "gameState"), {
      phase: "phase_b_locked",
      sequencePhaseBStartedAt: null,
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      phase: "phase_b_locked",
      autoGuessedCount,
    });
  } catch (error: any) {
    console.error("Lock phase B error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
