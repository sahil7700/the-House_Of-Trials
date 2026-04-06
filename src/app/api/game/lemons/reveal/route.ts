import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { step } = await req.json();

    if (![1, 2, 3].includes(step)) {
      return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    await updateDoc(doc(db, "system", "gameState"), {
      revealStep: step,
    });

    return NextResponse.json({ success: true, revealStep: step });
  } catch (error: any) {
    console.error("Reveal step error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
