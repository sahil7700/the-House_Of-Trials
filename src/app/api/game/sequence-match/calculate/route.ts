import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, updateDoc, writeBatch } from "firebase/firestore";

interface TargetPair {
  pairId: string;
  playerAId: string;
  playerBId: string;
  playerA_sequence: number[] | null;
  playerB_sequence: number[] | null;
  playerA_guess: number[] | null;
  playerB_guess: number[] | null;
  playerA_score: number | null;
  playerB_score: number | null;
  winnerId: string | null;
  loserId: string | null;
  tied: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, gameId, config } = await req.json();

    if (!slotNumber || gameId !== "C9" || !config) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { tieBreaker } = config;

    // Fetch pairs for this slot
    const pairsDocRef = doc(db, "pairs", String(slotNumber));
    const pairsSnap = await getDoc(pairsDocRef);

    if (!pairsSnap.exists()) {
      return NextResponse.json({ error: "No pairs found for this slot" }, { status: 404 });
    }

    const data = pairsSnap.data();
    const pairs: TargetPair[] = data.pairs || [];
    const eliminatedIds: string[] = [];

    // Fetch players to get their Phase B guesses
    const playersRef = collection(db, "players");
    const playersSnap = await getDocs(playersRef);
    const playerDocs = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Apply Phase B guesses
    for (const pair of pairs) {
       const pa = playerDocs.find(p => p.id === pair.playerAId);
       const pb = playerDocs.find(p => p.id === pair.playerBId);
       if (pa?.currentSubmission?.type === "guess") pair.playerA_guess = pa.currentSubmission.value;
       if (pb?.currentSubmission?.type === "guess") pair.playerB_guess = pb.currentSubmission.value;
    }

    // Calculate scores for each pair
    for (const pair of pairs) {
      if (pair.playerA_sequence && pair.playerB_guess) {
        pair.playerB_score = pair.playerB_guess.reduce((sum: number, guessVal: number, i: number) => {
          return sum + Math.abs(guessVal - pair.playerA_sequence![i]);
        }, 0);
      } else {
         pair.playerB_score = 999; // Penalty for missing input
      }

      if (pair.playerB_sequence && pair.playerA_guess) {
        pair.playerA_score = pair.playerA_guess.reduce((sum: number, guessVal: number, i: number) => {
          return sum + Math.abs(guessVal - pair.playerB_sequence![i]);
        }, 0);
      } else {
         pair.playerA_score = 999;
      }

      // Assign winner/loser (lower score is better)
      if (pair.playerA_score < pair.playerB_score) {
        pair.winnerId = pair.playerAId;
        pair.loserId = pair.playerBId;
        pair.tied = false;
        eliminatedIds.push(pair.playerBId);
      } else if (pair.playerB_score < pair.playerA_score) {
        pair.winnerId = pair.playerBId;
        pair.loserId = pair.playerAId;
        pair.tied = false;
        eliminatedIds.push(pair.playerAId);
      } else {
        pair.tied = true;
        pair.winnerId = null;
        pair.loserId = null;

        if (tieBreaker === "eliminate_all") {
          if (pair.playerAId) eliminatedIds.push(pair.playerAId);
          if (pair.playerBId) eliminatedIds.push(pair.playerBId);
        } else if (tieBreaker === "eliminate_none") {
          // both safe
        }
        // "admin" leaves them alone, and admin decides later
      }
    }

    // Write all pair results back to pairs collection
    const batch = writeBatch(db);
    batch.update(pairsDocRef, { pairs });

    // Update gameState results
    const gameStateRef = doc(db, "system", "gameState");
    batch.update(gameStateRef, {
      results: {
        pairs,
        eliminatedPlayerIds: eliminatedIds,
        message: "Calculations Complete"
      },
      phase: "reveal"
    });

    await batch.commit();

    return NextResponse.json({ success: true, pairs, eliminatedPlayerIds: eliminatedIds });
  } catch (error: any) {
    console.error("Calculate Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
