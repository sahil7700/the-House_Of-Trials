import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, collection, getDocs, query, where, writeBatch } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, config } = await req.json();

    if (!slotNumber) {
      return NextResponse.json({ error: "slotNumber is required" }, { status: 400 });
    }

    const batch = writeBatch(db);

    batch.update(doc(db, "system", "gameState"), {
      phase: "phase_a_open",
      sequencePhaseAStartedAt: serverTimestamp(),
      sequenceConfig: config || {
        phaseASeconds: 120,
        phaseBSeconds: 90,
        showOpponentName: true,
        exactMatchBonus: 10,
        winnerPoints: 80,
        loserPoints: 0,
        tieRule: "admin_decides",
      },
    });

    const playersSnap = await getDocs(query(collection(db, "players"), where("status", "==", "alive")));
    playersSnap.docs.forEach(p => {
      batch.update(p.ref, { currentSubmission: null, submittedAt: null });
    });

    await batch.commit();

    return NextResponse.json({ success: true, phase: "phase_a_open" });
  } catch (error: any) {
    console.error("Start phase A error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
