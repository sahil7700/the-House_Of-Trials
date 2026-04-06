import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    await updateDoc(doc(db, "system", "gameState"), {
      phase: "trading_open",
      tradingStartedAt: serverTimestamp(),
      revealStep: 0,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Open trading error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
