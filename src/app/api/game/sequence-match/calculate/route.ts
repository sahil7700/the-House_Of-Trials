import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

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

    // Fetch Phase B submissions from submissions collection (audit source)
    const submissionsRef = collection(db, "submissions");
    const guessQ = query(submissionsRef, where("slotNumber", "==", slotNumber), where("gameId", "==", "C9"), where("phase", "==", "B"));
    const guessSnap = await getDocs(guessQ);
    const guessSubmissions: Record<string, number[]> = {};
    guessSnap.docs.forEach(d => {
      const sub = d.data() as { playerId?: string; value?: { value?: number[] } };
      if (sub.playerId && sub.value?.value) {
        guessSubmissions[sub.playerId] = sub.value.value;
      }
    });

    // Apply Phase B guesses (from submissions collection, fallback to players collection)
    for (const pair of pairs) {
       // Try submissions collection first (authoritative), then fallback to players doc
       const paGuess = guessSubmissions[pair.playerAId] ?? playerDocs.find(p => p.id === pair.playerAId)?.currentSubmission?.value;
       const pbGuess = guessSubmissions[pair.playerBId] ?? playerDocs.find(p => p.id === pair.playerBId)?.currentSubmission?.value;
       if (paGuess) pair.playerA_guess = paGuess;
       if (pbGuess) pair.playerB_guess = pbGuess;
    }

    const pointsDeltaMap: Record<string, number> = {};
    const baseWinPoints = 80;
    const exactMatchPoints = 10;
    const exactMatchBonusEnabled = config.exactMatchBonus !== false;

    // Calculate scores and initialize points
    for (const pair of pairs) {
      pointsDeltaMap[pair.playerAId] = 0;
      pointsDeltaMap[pair.playerBId] = 0;

      if (pair.playerA_sequence && pair.playerB_guess) {
        let scoreB = 0;
        pair.playerB_guess.forEach((guessVal: number, i: number) => {
          const diff = Math.abs(guessVal - pair.playerA_sequence![i]);
          scoreB += diff;
          if (diff === 0 && exactMatchBonusEnabled) pointsDeltaMap[pair.playerBId] += exactMatchPoints;
        });
        pair.playerB_score = scoreB;
      } else {
         pair.playerB_score = 999;
      }

      if (pair.playerB_sequence && pair.playerA_guess) {
        let scoreA = 0;
        pair.playerA_guess.forEach((guessVal: number, i: number) => {
          const diff = Math.abs(guessVal - pair.playerB_sequence![i]);
          scoreA += diff;
          if (diff === 0 && exactMatchBonusEnabled) pointsDeltaMap[pair.playerAId] += exactMatchPoints;
        });
        pair.playerA_score = scoreA;
      } else {
         pair.playerA_score = 999;
      }

      // Assign winner/loser (lower score is better)
      if (pair.playerA_score < pair.playerB_score) {
        pair.winnerId = pair.playerAId;
        pair.loserId = pair.playerBId;
        pair.tied = false;
        eliminatedIds.push(pair.playerBId);
        pointsDeltaMap[pair.playerAId] += baseWinPoints;
      } else if (pair.playerB_score < pair.playerA_score) {
        pair.winnerId = pair.playerBId;
        pair.loserId = pair.playerAId;
        pair.tied = false;
        eliminatedIds.push(pair.playerAId);
        pointsDeltaMap[pair.playerBId] += baseWinPoints;
      } else {
        pair.tied = true;
        pair.winnerId = null;
        pair.loserId = null;

        if (tieBreaker === "eliminate_all" || tieBreaker === "eliminate_both") {
          if (pair.playerAId) eliminatedIds.push(pair.playerAId);
          if (pair.playerBId) eliminatedIds.push(pair.playerBId);
        } else if (tieBreaker === "eliminate_none" || tieBreaker === "survive_both") {
          pointsDeltaMap[pair.playerAId] += baseWinPoints;
          pointsDeltaMap[pair.playerBId] += baseWinPoints;
        }
        // "admin" leaves them alone, admin resolves manually later
      }
    }

    return NextResponse.json({ success: true, pairs, eliminatedPlayerIds: eliminatedIds, pointsDeltaMap });
  } catch (error: any) {
    console.error("Calculate Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
