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
    let autoSealedCount = 0;

    for (const pairDoc of pairsSnap.docs) {
      const pair = pairDoc.data();
      let updated = false;
      const updates: Record<string, any> = {};

      if (pair.playerAId !== "BYE" && !pair.playerA_sequence) {
        const pA = playerMap[pair.playerAId];
        const seq = pA?.currentSubmission?.type === "sequence" ? pA.currentSubmission.value : [0, 0, 0];
        updates.playerA_sequence = seq;
        updates.playerA_sequenceLockedAt = serverTimestamp();
        updates.playerA_autoSealed = !pA?.currentSubmission;
        autoSealedCount++;
        updated = true;
      }

      if (pair.playerBId !== "BYE" && !pair.playerB_sequence) {
        const pB = playerMap[pair.playerBId];
        const seq = pB?.currentSubmission?.type === "sequence" ? pB.currentSubmission.value : [0, 0, 0];
        updates.playerB_sequence = seq;
        updates.playerB_sequenceLockedAt = serverTimestamp();
        updates.playerB_autoSealed = !pB?.currentSubmission;
        autoSealedCount++;
        updated = true;
      }

      if (updated) {
        batch.update(pairDoc.ref, updates);
      }
    }

    playersSnap.docs.forEach(p => {
      batch.update(p.ref, { currentSubmission: null, submittedAt: null });
    });

    batch.update(doc(db, "system", "gameState"), {
      phase: "phase_b_open",
      sequencePhaseAStartedAt: null,
      sequencePhaseBStartedAt: serverTimestamp(),
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      phase: "phase_b_open",
      autoSealedCount,
    });
  } catch (error: any) {
    console.error("Lock phase A error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
