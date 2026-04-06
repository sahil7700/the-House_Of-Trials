import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, collection, getDocs, query, where, writeBatch, addDoc, Timestamp } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, confidenceEnabled } = await req.json();

    const playersSnap = await getDocs(query(collection(db, "players"), where("status", "==", "alive")));
    const submissionsSnap = await getDocs(
      query(collection(db, "submissions"), where("slotNumber", "==", Number(slotNumber)), where("gameId", "==", "B8"))
    );
    const submittedPlayerIds = new Set(submissionsSnap.docs.map(d => d.data().playerId));

    const batch = writeBatch(db);
    const now = Timestamp.now();

    for (const playerDoc of playersSnap.docs) {
      const pid = playerDoc.id;
      if (!submittedPlayerIds.has(pid)) {
        const newSubRef = doc(collection(db, "submissions"));
        batch.set(newSubRef, {
          playerId: pid,
          slotNumber: Number(slotNumber),
          gameId: "B8",
          vote: null,
          confidence: null,
          autoVoted: true,
          submittedAt: now,
          isCorrect: null,
          isEliminated: null,
          isOverconfident: null,
        });
        batch.update(playerDoc.ref, { currentSubmission: "AUTO", submittedAt: now });
      }
    }

    const nextPhase = confidenceEnabled ? "confidence" : "voting_locked";
    batch.update(doc(db, "system", "gameState"), {
      phase: nextPhase,
      ...(nextPhase === "confidence" ? { confidenceStartedAt: now } : {}),
    });

    await batch.commit();

    return NextResponse.json({ success: true, phase: nextPhase });
  } catch (error: any) {
    console.error("B8 lock votes error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
