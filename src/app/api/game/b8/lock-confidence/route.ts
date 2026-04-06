import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, collection, getDocs, query, where, writeBatch, Timestamp } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber } = await req.json();

    const submissionsSnap = await getDocs(
      query(collection(db, "submissions"), where("slotNumber", "==", Number(slotNumber)), where("gameId", "==", "B8"))
    );

    const batch = writeBatch(db);
    const now = Timestamp.now();

    for (const subDoc of submissionsSnap.docs) {
      const sub = subDoc.data();
      if (sub.confidence === null || sub.confidence === undefined) {
        batch.update(subDoc.ref, { confidence: 50, autoConfidence: true });
      }
    }

    batch.update(doc(db, "system", "gameState"), {
      phase: "confidence_locked",
    });

    await batch.commit();

    return NextResponse.json({ success: true, phase: "confidence_locked" });
  } catch (error: any) {
    console.error("B8 lock confidence error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
