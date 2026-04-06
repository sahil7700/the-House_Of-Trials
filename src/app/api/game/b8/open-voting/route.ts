import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber } = await req.json();

    await updateDoc(doc(db, "system", "gameState"), {
      phase: "voting_open",
      votingStartedAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true, phase: "voting_open" });
  } catch (error: any) {
    console.error("B8 open voting error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
