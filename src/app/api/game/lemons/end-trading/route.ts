import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, writeBatch, doc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber } = await req.json();

    const pendingQ = query(
      collection(db, "marketTrades"),
      where("slotNumber", "==", slotNumber),
      where("status", "==", "pending")
    );
    const pendingSnap = await getDocs(pendingQ);

    const batch = writeBatch(db);

    // Expire all pending trades
    pendingSnap.forEach(d => {
      batch.update(d.ref, { status: "expired", resolvedAt: serverTimestamp() });
    });

    // Set phase to trading_locked
    batch.update(doc(db, "system", "gameState"), {
      phase: "trading_locked",
    });

    await batch.commit();

    return NextResponse.json({ success: true, expiredCount: pendingSnap.size });
  } catch (error: any) {
    console.error("End trading error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
