import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, collection, getDocs, query, where, writeBatch } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { pairId, resolution, slotNumber } = await req.json();

    if (!pairId || !resolution || !slotNumber) {
      return NextResponse.json({ error: "pairId, resolution, and slotNumber are required" }, { status: 400 });
    }

    const pairDoc = await getDocs(
      query(collection(db, "sequencePairs"), where("pairId", "==", pairId))
    );

    if (pairDoc.empty) {
      return NextResponse.json({ error: "Pair not found" }, { status: 404 });
    }

    const pair = pairDoc.docs[0];
    const pairData = pair.data();

    const batch = writeBatch(db);

    switch (resolution) {
      case "eliminate_a":
        batch.update(pair.ref, { winnerId: pairData.playerBId, loserId: pairData.playerAId, tied: false });
        batch.update(doc(db, "players", pairData.playerAId), { status: "eliminated" });
        break;
      case "eliminate_b":
        batch.update(pair.ref, { winnerId: pairData.playerAId, loserId: pairData.playerBId, tied: false });
        batch.update(doc(db, "players", pairData.playerBId), { status: "eliminated" });
        break;
      case "both_safe":
        batch.update(pair.ref, { winnerId: pairData.playerAId, loserId: null, tied: false });
        batch.update(pair.ref, { winnerId: pairData.playerBId, loserId: null, tied: false });
        break;
      case "both_out":
        batch.update(pair.ref, { winnerId: null, loserId: pairData.playerAId, tied: false });
        batch.update(pair.ref, { winnerId: null, loserId: pairData.playerBId, tied: false });
        batch.update(doc(db, "players", pairData.playerAId), { status: "eliminated" });
        batch.update(doc(db, "players", pairData.playerBId), { status: "eliminated" });
        break;
      default:
        return NextResponse.json({ error: "Invalid resolution" }, { status: 400 });
    }

    await batch.commit();

    return NextResponse.json({ success: true, resolution });
  } catch (error: any) {
    console.error("Resolve tie error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
