import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, collection, getDocs, query, writeBatch } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, eliminatedPlayerIds, pointsDeltaMap } = await req.json();

    if (!slotNumber) {
      return NextResponse.json({ error: "slotNumber is required" }, { status: 400 });
    }

    const gameStateSnap = await getDocs(collection(db, "system"));
    const gameState = gameStateSnap.docs.find(d => d.id === "gameState")?.data();

    const eliminations = eliminatedPlayerIds || gameState?.pendingEliminations || [];
    const points = pointsDeltaMap || {};

    const batch = writeBatch(db);

    for (const playerId of eliminations) {
      batch.update(doc(db, "players", playerId), {
        status: "eliminated",
        pointsDelta: 0,
        eliminatedAt: new Date().toISOString(),
        eliminationGame: "C9",
      });
    }

    Object.entries(points).forEach(([playerId, delta]) => {
      if (!eliminations.includes(playerId)) {
        batch.update(doc(db, "players", playerId), {
          pointsDelta: delta as number,
          survivingPointsAwarded: delta as number,
        });
      }
    });

    batch.update(doc(db, "system", "gameState"), {
      phase: "confirmed",
      pendingEliminations: [],
      sequencePairsCreated: false,
      sequenceByePlayerId: null,
      sequenceTiedPairs: [],
      sequenceRevealStep: 0,
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      eliminatedCount: eliminations.length,
    });
  } catch (error: any) {
    console.error("Confirm eliminations error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
