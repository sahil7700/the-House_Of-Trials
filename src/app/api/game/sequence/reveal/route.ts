import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { step, revealPairId } = await req.json();

    if (step === undefined) {
      return NextResponse.json({ error: "step is required" }, { status: 400 });
    }

    await updateDoc(doc(db, "system", "gameState"), {
      sequenceRevealStep: Number(step),
      ...(revealPairId ? { sequenceRevealedPairId: revealPairId } : {}),
    });

    return NextResponse.json({ success: true, step, revealPairId });
  } catch (error: any) {
    console.error("Sequence reveal error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
