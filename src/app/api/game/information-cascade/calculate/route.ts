import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, gameId, gameSpecificConfig } = await req.json();

    if (!slotNumber || gameId !== "B8" || !gameSpecificConfig) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { trueMajority, publicFeed, queue } = gameSpecificConfig;

    if (!trueMajority) {
       return NextResponse.json({ error: "No true majority established." }, { status: 400 });
    }

    // Fetch all players to check their submissions
    const playersRef = collection(db, "players");
    const playersSnap = await getDocs(playersRef);
    
    const eliminatedIds: string[] = [];
    const validChoices = ["RED", "BLUE"];

    playersSnap.docs.forEach(docSnap => {
       const pd = docSnap.data();
       if (pd.status !== "alive") return;

       // Was player in the queue for this game?
       if (!queue || !queue.includes(pd.id)) return;

       const choice = pd.currentSubmission;

       if (!choice || !validChoices.includes(choice)) {
          // No submission = eliminated
          eliminatedIds.push(pd.id);
       } else if (choice !== trueMajority) {
          // Wrong choice = eliminated
          eliminatedIds.push(pd.id);
       }
    });

    const results = {
       trueMajority,
       feed: publicFeed || [],
       survivorsCount: queue.length - eliminatedIds.length,
       eliminatedCount: eliminatedIds.length,
       eliminatedPlayerIds: eliminatedIds
    };

    return NextResponse.json({ success: true, results, eliminatedPlayerIds: eliminatedIds });
  } catch (error: any) {
    console.error("Calculate Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
