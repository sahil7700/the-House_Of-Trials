import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, collection, getDocs, writeBatch } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, eliminatedPlayerIds, pointsDeltaMap } = await req.json();

    const batch = writeBatch(db);

    const eliminations = eliminatedPlayerIds || [];
    for (const playerId of eliminations) {
      batch.update(doc(db, "players", playerId), {
        status: "eliminated",
        pointsDelta: 0,
        eliminatedAt: new Date().toISOString(),
        eliminationGame: "B8",
      });
    }

    Object.entries(pointsDeltaMap || {}).forEach(([playerId, delta]) => {
      if (!eliminations.includes(playerId)) {
        batch.update(doc(db, "players", playerId), {
          pointsDelta: delta as number,
        });
      }
    });

    batch.update(doc(db, "system", "gameState"), {
      phase: "confirmed",
      pendingEliminations: [],
      b8Config: null,
      b8Results: null,
      b8RevealStep: 0,
    });

    await batch.commit();

    return NextResponse.json({ success: true, eliminatedCount: eliminations.length });
  } catch (error: any) {
    console.error("B8 confirm eliminations error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
