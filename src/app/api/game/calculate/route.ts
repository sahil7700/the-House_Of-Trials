import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { runGenericCalculator } from "./calculators";

export async function POST(req: Request) {
  try {
    const { slotNumber, gameId } = await req.json();

    if (!slotNumber || !gameId) {
      return NextResponse.json({ error: "Missing slotNumber or gameId" }, { status: 400 });
    }

    // 1. Fetch EventConfig to get the slot config
    const eventConfigSnap = await getDoc(doc(db, "system", "eventConfig"));
    if (!eventConfigSnap.exists()) {
       return NextResponse.json({ error: "Missing eventConfig" }, { status: 500 });
    }
    const eventConfig = eventConfigSnap.data();
    const slotConfig = eventConfig.slots.find((s: any) => s.slotNumber === slotNumber);
    if (!slotConfig) {
       return NextResponse.json({ error: "Invalid slot number" }, { status: 400 });
    }

    // 2. Fetch all submissions for current slot
    const q = query(collection(db, "submissions"), where("slotNumber", "==", slotNumber));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      // In a real V2 we might auto eliminate non-submitters here using slotConfig.penaltyNoSubmit
      return NextResponse.json({ message: "No submissions found.", success: true });
    }

    const submissions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    // 3. Run Dynamic Calculator
    const { results, eliminatedPlayerIds } = runGenericCalculator(submissions, slotConfig);

    // 4. Update GameState with results
    await updateDoc(doc(db, "system", "gameState"), {
      results: { ...results, eliminatedPlayerIds }
    });

    return NextResponse.json({ success: true, results, eliminatedPlayerIds });

  } catch (error: any) {
    console.error("Calculate Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
