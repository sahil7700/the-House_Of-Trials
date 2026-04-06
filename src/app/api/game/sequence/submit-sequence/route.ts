import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, collection, getDocs, query, where } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { playerId, slotNumber, sequence } = await req.json();

    if (!playerId || !slotNumber || !Array.isArray(sequence) || sequence.length !== 3) {
      return NextResponse.json({ error: "Invalid parameters. sequence must be array of 3 digits." }, { status: 400 });
    }

    for (const digit of sequence) {
      if (typeof digit !== "number" || digit < 0 || digit > 9 || !Number.isInteger(digit)) {
        return NextResponse.json({ error: "Each digit must be an integer between 0 and 9." }, { status: 400 });
      }
    }

    const pairsSnap = await getDocs(
      query(collection(db, "sequencePairs"), where("slotNumber", "==", Number(slotNumber)))
    );
    const myPair = pairsSnap.docs.find(d => {
      const data = d.data();
      return data.playerAId === playerId || data.playerBId === playerId;
    });

    if (!myPair) {
      return NextResponse.json({ error: "You are not in any pair for this slot." }, { status: 404 });
    }

    const pairData = myPair.data();
    const isPlayerA = pairData.playerAId === playerId;
    const updateField = isPlayerA ? "playerA_sequence" : "playerB_sequence";
    const timeField = isPlayerA ? "playerA_sequenceLockedAt" : "playerB_sequenceLockedAt";

    await updateDoc(doc(db, "sequencePairs", myPair.id), {
      [updateField]: sequence,
      [timeField]: serverTimestamp(),
    });

    await updateDoc(doc(db, "players", playerId), {
      currentSubmission: { type: "sequence", value: sequence },
      submittedAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true, sequence, submittedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error("Submit sequence error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
