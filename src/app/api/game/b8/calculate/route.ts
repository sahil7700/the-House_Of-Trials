import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, collection, getDocs, query, where, writeBatch } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, gameState } = await req.json();

    const b8Config = (gameState as any)?.b8Config || {};
    const correctAnswer = b8Config.correctAnswer || "A";

    const submissionsSnap = await getDocs(
      query(collection(db, "submissions"), where("slotNumber", "==", Number(slotNumber)), where("gameId", "==", "B8"))
    );

    const batch = writeBatch(db);
    let votesA = 0, votesB = 0, nullVotes = 0;
    let eliminatedCount = 0, overconfidentCount = 0;
    const eliminatedPlayerIds: string[] = [];
    const eliminatedWithOverconfident: string[] = [];

    for (const subDoc of submissionsSnap.docs) {
      const sub = subDoc.data();
      const vote = sub.vote;
      const confidence = sub.confidence;
      const autoVoted = sub.autoVoted || false;

      if (vote === "A") votesA++;
      else if (vote === "B") votesB++;
      else nullVotes++;

      const isCorrect = vote === correctAnswer;
      const isEliminated = !isCorrect || vote === null;
      const isOverconfident = isEliminated && confidence === 100;

      batch.update(subDoc.ref, {
        isCorrect,
        isEliminated,
        isOverconfident,
      });

      if (isEliminated && sub.playerId) {
        eliminatedPlayerIds.push(sub.playerId);
        if (isOverconfident) eliminatedWithOverconfident.push(sub.playerId);
        eliminatedCount++;
        if (isOverconfident) overconfidentCount++;
      }
    }

    batch.update(doc(db, "system", "gameState"), {
      phase: "reveal",
      b8RevealStep: 0,
      b8Results: {
        totalVoters: submissionsSnap.size,
        votesA,
        votesB,
        nullVotes,
        correctAnswer,
        eliminatedCount,
        overconfidentCount,
      },
      pendingEliminations: eliminatedPlayerIds,
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      eliminatedPlayerIds,
      eliminatedWithOverconfident,
      votesA,
      votesB,
      correctAnswer,
      eliminatedCount,
      overconfidentCount,
    });
  } catch (error: any) {
    console.error("B8 calculate error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
