import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, collection, getDocs, writeBatch } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, config } = await req.json();

    const batch = writeBatch(db);

    batch.update(doc(db, "system", "gameState"), {
      phase: "image_flash",
      b8Config: config || {
        questionId: null,
        customQuestion: null,
        correctAnswer: "A",
        optionALabel: "Option A",
        optionBLabel: "Option B",
        imageFlashSeconds: 3,
        votingSeconds: 7,
        confidenceEnabled: true,
        confidenceSeconds: 5,
        fakeMajorityEnabled: true,
        fakeMajorityBiasToward: "A",
        fakeMajorityStartPercent: 72,
      },
      b8Results: null,
      imageFlashStartedAt: serverTimestamp(),
    });

    const playersSnap = await getDocs(collection(db, "players"));
    playersSnap.docs.forEach(p => {
      batch.update(p.ref, { currentSubmission: null, submittedAt: null });
    });

    await batch.commit();

    return NextResponse.json({ success: true, phase: "image_flash" });
  } catch (error: any) {
    console.error("B8 start flash error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
