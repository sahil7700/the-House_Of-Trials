import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const { gameId } = await req.json();

    if (!gameId) {
      return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
    }

    // 1. Fetch all submissions for current game
    const q = query(collection(db, "submissions"), where("gameId", "==", gameId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return NextResponse.json({ message: "No submissions found." });
    }

    const submissions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    // 2. Calculate Average
    const sum = submissions.reduce((acc, curr) => acc + curr.value, 0);
    const average = sum / submissions.length;

    // 3. Calculate Target (2/3 of average) rounding to 2 dec for display but keeping precision for distance
    const target = average * (2/3);

    // 4 & 5. Calculate distances and find maximum
    let maxDistance = -1;
    for (const sub of submissions) {
      const distance = Math.abs(sub.value - target);
      sub.distance = distance;
      
      // Update individual distance in DB (optional but good for tracking)
      await updateDoc(doc(db, "submissions", sub.id), { distance });

      if (distance > maxDistance) {
        maxDistance = distance;
      }
    }

    // 6. Find eliminated players
    // Due to float precision, we check max distance with a tiny epsilon
    const epsilon = 0.0001;
    const eliminatedPlayers = submissions.filter(sub => Math.abs(sub.distance - maxDistance) < epsilon);
    const eliminatedPlayerIds = eliminatedPlayers.map(sub => sub.playerId);

    // 7. Write results back to gameState
    const results = {
      average,
      target,
      maxDistance,
      eliminatedPlayerIds
    };

    await updateDoc(doc(db, "system", "gameState"), {
      results
    });

    return NextResponse.json({ success: true, results });

  } catch (error: any) {
    console.error("Calculate Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
