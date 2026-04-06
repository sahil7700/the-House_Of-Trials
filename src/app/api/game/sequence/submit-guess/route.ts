import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, collection, getDocs, query, where, writeBatch } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { playerId, slotNumber, guess } = await req.json();

    if (!playerId || !slotNumber || !Array.isArray(guess) || guess.length !== 3) {
      return NextResponse.json({ error: "Invalid parameters. guess must be array of 3 digits." }, { status: 400 });
    }

    for (const digit of guess) {
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
    if (pairData.byePair) {
      return NextResponse.json({ error: "Bye player cannot submit a guess." }, { status: 400 });
    }

    const isPlayerA = pairData.playerAId === playerId;
    const updateField = isPlayerA ? "playerA_guess" : "playerB_guess";
    const timeField = isPlayerA ? "playerA_guessLockedAt" : "playerB_guessLockedAt";

    const batch = writeBatch(db);
    batch.update(doc(db, "sequencePairs", myPair.id), {
      [updateField]: guess,
      [timeField]: serverTimestamp(),
    });
    batch.update(doc(db, "players", playerId), {
      currentSubmission: { type: "guess", value: guess },
      submittedAt: serverTimestamp(),
    });
    await batch.commit();

    return NextResponse.json({ success: true, guess, submittedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error("Submit guess error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
