import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, collection, getDocs, query, where, writeBatch } from "firebase/firestore";

interface SequencePair {
  pairId: string;
  playerAId: string;
  playerBId: string;
  playerAName: string;
  playerBName: string;
  playerA_sequence: number[] | null;
  playerB_sequence: number[] | null;
  playerA_guess: number[] | null;
  playerB_guess: number[] | null;
  playerA_score: number | null;
  playerB_score: number | null;
  winnerId: string | null;
  loserId: string | null;
  tied: boolean;
  byePair: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, tieRule } = await req.json();

    if (!slotNumber) {
      return NextResponse.json({ error: "slotNumber is required" }, { status: 400 });
    }

    const pairsSnap = await getDocs(
      query(collection(db, "sequencePairs"), where("slotNumber", "==", Number(slotNumber)))
    );

    if (pairsSnap.empty) {
      return NextResponse.json({ error: "No pairs found for this slot" }, { status: 404 });
    }

    const eliminatedPlayerIds: string[] = [];
    const winnerIds: string[] = [];
    const tiedPairIds: string[] = [];
    const pointsDeltaMap: Record<string, number> = {};
    const winnersPoints = 80;
    const exactMatchBonus = 10;

    const batch = writeBatch(db);

    for (const pairDoc of pairsSnap.docs) {
      const pair = pairDoc.data() as SequencePair;

      if (pair.byePair) {
        pointsDeltaMap[pair.playerAId] = winnersPoints;
        batch.update(pairDoc.ref, {
          playerA_score: 0,
          winnerId: pair.playerAId,
          loserId: null,
          tied: false,
        });
        winnerIds.push(pair.playerAId);
        continue;
      }

      if (
        !pair.playerA_sequence || !pair.playerB_sequence ||
        !pair.playerA_guess || !pair.playerB_guess
      ) {
        continue;
      }

      let playerA_score = 0;
      let playerB_score = 0;
      let playerA_exactMatches = 0;
      let playerB_exactMatches = 0;

      for (let i = 0; i < 3; i++) {
        const aGuessDiff = Math.abs(pair.playerA_guess[i] - pair.playerB_sequence[i]);
        playerA_score += aGuessDiff;
        if (aGuessDiff === 0) playerA_exactMatches++;

        const bGuessDiff = Math.abs(pair.playerB_guess[i] - pair.playerA_sequence[i]);
        playerB_score += bGuessDiff;
        if (bGuessDiff === 0) playerB_exactMatches++;
      }

      pointsDeltaMap[pair.playerAId] = playerA_exactMatches * exactMatchBonus;
      pointsDeltaMap[pair.playerBId] = playerB_exactMatches * exactMatchBonus;

      let winnerId: string | null = null;
      let loserId: string | null = null;
      let tied = false;

      if (playerA_score < playerB_score) {
        winnerId = pair.playerAId;
        loserId = pair.playerBId;
        eliminatedPlayerIds.push(pair.playerBId);
        pointsDeltaMap[pair.playerAId] += winnersPoints;
        winnerIds.push(pair.playerAId);
      } else if (playerB_score < playerA_score) {
        winnerId = pair.playerBId;
        loserId = pair.playerAId;
        eliminatedPlayerIds.push(pair.playerAId);
        pointsDeltaMap[pair.playerBId] += winnersPoints;
        winnerIds.push(pair.playerBId);
      } else {
        tied = true;
        tiedPairIds.push(pair.pairId);

        const rule = tieRule || "admin_decides";
        if (rule === "both_eliminated") {
          eliminatedPlayerIds.push(pair.playerAId);
          eliminatedPlayerIds.push(pair.playerBId);
        } else if (rule === "both_safe") {
          pointsDeltaMap[pair.playerAId] += winnersPoints;
          pointsDeltaMap[pair.playerBId] += winnersPoints;
          winnerIds.push(pair.playerAId);
          winnerIds.push(pair.playerBId);
        }
      }

      batch.update(pairDoc.ref, {
        playerA_score,
        playerB_score,
        playerA_exactMatches,
        playerB_exactMatches,
        winnerId,
        loserId,
        tied,
      });
    }

    batch.update(doc(db, "system", "gameState"), {
      phase: "reveal",
      pendingEliminations: eliminatedPlayerIds,
      sequenceTiedPairs: tiedPairIds,
      sequenceRevealStep: 0,
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      eliminatedPlayerIds,
      winnerIds,
      tiedPairIds,
      pointsDeltaMap,
      totalPairs: pairsSnap.size,
    });
  } catch (error: any) {
    console.error("Sequence calculate error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
