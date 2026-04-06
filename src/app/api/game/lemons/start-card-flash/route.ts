import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    await updateDoc(doc(db, "system", "gameState"), {
      phase: "card_flash",
      cardFlashStartedAt: serverTimestamp(),
      revealStep: 0,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Start card flash error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
