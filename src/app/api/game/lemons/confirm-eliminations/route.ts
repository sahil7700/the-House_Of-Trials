import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, writeBatch } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const gameStateSnap = await getDoc(doc(db, "system", "gameState"));
    const gameState = gameStateSnap.data();

    const pendingEliminations: string[] = gameState?.pendingEliminations || [];

    if (pendingEliminations.length === 0) {
      return NextResponse.json({ success: true, eliminated: 0, message: "No eliminations to process." });
    }

    const batch = writeBatch(db);

    for (const playerId of pendingEliminations) {
      batch.update(doc(db, "players", playerId), {
        status: "eliminated",
        pendingElimination: false,
        pointsDelta: 0,
      });
    }

    batch.update(doc(db, "system", "gameState"), {
      phase: "confirmed",
      pendingEliminations: [],
    });

    await batch.commit();

    return NextResponse.json({ success: true, eliminated: pendingEliminations.length });
  } catch (error: any) {
    console.error("Confirm eliminations error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
