import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

interface AdvanceTurnRequest {
  playerId: string;
  slotNumber: number;
  gameId: string;
  choice: "RED" | "BLUE";
}

export async function POST(req: NextRequest) {
  try {
    const body: AdvanceTurnRequest = await req.json();
    const { playerId, slotNumber, gameId, choice } = body;

    if (!playerId || !slotNumber || gameId !== "B8" || !choice) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    if (!["RED", "BLUE"].includes(choice)) {
      return NextResponse.json({ error: "Invalid choice value" }, { status: 400 });
    }

    await updateDoc(doc(db, "players", playerId), {
      currentSubmission: choice,
      submittedAt: new Date(),
    });

    return NextResponse.json({ success: true, choice });
  } catch (error: any) {
    console.error("B8 Advance Turn Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
