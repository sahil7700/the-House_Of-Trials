import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, collection, getDocs, query, where } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { playerId, slotNumber, vote } = await req.json();

    if (!playerId || !slotNumber || !["A", "B"].includes(vote)) {
      return NextResponse.json({ error: "Invalid parameters. vote must be 'A' or 'B'." }, { status: 400 });
    }

    const submissionsSnap = await getDocs(
      query(collection(db, "submissions"), where("playerId", "==", playerId), where("slotNumber", "==", Number(slotNumber)), where("gameId", "==", "B8"))
    );

    const submissionData = {
      playerId,
      slotNumber: Number(slotNumber),
      gameId: "B8",
      vote,
      confidence: null,
      autoVoted: false,
      submittedAt: serverTimestamp(),
      isCorrect: null,
      isEliminated: null,
      isOverconfident: null,
    };

    if (submissionsSnap.empty) {
      const { addDoc } = await import("firebase/firestore");
      await addDoc(collection(db, "submissions"), submissionData);
    } else {
      await updateDoc(doc(db, "submissions", submissionsSnap.docs[0].id), {
        vote,
        submittedAt: serverTimestamp(),
      });
    }

    await updateDoc(doc(db, "players", playerId), {
      currentSubmission: vote,
      submittedAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true, vote });
  } catch (error: any) {
    console.error("B8 submit vote error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
