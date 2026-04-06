import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, writeBatch, getDocs, query, where } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber } = await req.json();

    if (!slotNumber) {
      return NextResponse.json({ error: "slotNumber is required" }, { status: 400 });
    }

    const playersSnap = await getDocs(
      query(collection(db, "players"), where("status", "==", "alive"))
    );
    const alivePlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    if (alivePlayers.length === 0) {
      return NextResponse.json({ error: "No alive players found", detail: "No players with status='alive' in database" }, { status: 404 });
    }

    const shuffled = [...alivePlayers].sort(() => 0.5 - Math.random());

    let byePlayer = null;
    let players = shuffled;

    if (shuffled.length % 2 !== 0) {
      const byeIndex = Math.floor(Math.random() * shuffled.length);
      byePlayer = shuffled.splice(byeIndex, 1)[0];
    }

    const pairs: any[] = [];
    const pairBatch = writeBatch(db);

    for (let i = 0; i < players.length; i += 2) {
      const pairId = `pair_${String(slotNumber)}_${i / 2 + 1}`;
      const pair = {
        pairId,
        pairIndex: i / 2 + 1,
        slotNumber: Number(slotNumber),
        playerAId: players[i].id,
        playerAName: players[i].name || players[i].id,
        playerBId: players[i + 1].id,
        playerBName: players[i + 1].name || players[i + 1].id,
        playerA_sequence: null,
        playerA_sequenceLockedAt: null,
        playerB_sequence: null,
        playerB_sequenceLockedAt: null,
        playerA_guess: null,
        playerA_guessLockedAt: null,
        playerB_guess: null,
        playerB_guessLockedAt: null,
        playerA_score: null,
        playerB_score: null,
        winnerId: null,
        loserId: null,
        tied: false,
        byePair: false,
      };
      pairs.push(pair);
      pairBatch.set(doc(db, "sequencePairs", pairId), pair);
    }

    if (byePlayer) {
      const byePairId = `pair_${String(slotNumber)}_bye`;
      const byePair = {
        pairId: byePairId,
        pairIndex: pairs.length + 1,
        slotNumber: Number(slotNumber),
        playerAId: byePlayer.id,
        playerAName: byePlayer.name || byePlayer.id,
        playerBId: "BYE",
        playerBName: "BYE — Auto-advance",
        playerA_sequence: null,
        playerA_sequenceLockedAt: null,
        playerB_sequence: null,
        playerB_sequenceLockedAt: null,
        playerA_guess: null,
        playerA_guessLockedAt: null,
        playerB_guess: null,
        playerB_guessLockedAt: null,
        playerA_score: null,
        playerB_score: null,
        winnerId: null,
        loserId: null,
        tied: false,
        byePair: true,
      };
      pairs.push(byePair);
      pairBatch.set(doc(db, "sequencePairs", byePairId), byePair);
    }

    pairBatch.update(doc(db, "system", "gameState"), {
      sequencePairsCreated: true,
      sequenceByePlayerId: byePlayer?.id || null,
      sequencePhaseAStartedAt: null,
      sequencePhaseBStartedAt: null,
      sequenceTiedPairs: [],
      sequenceRevealStep: 0,
      sequenceConfig: {
        phaseASeconds: 120,
        phaseBSeconds: 90,
        showOpponentName: true,
        exactMatchBonus: 10,
        winnerPoints: 80,
        loserPoints: 0,
        tieRule: "admin_decides",
      },
    });

    await pairBatch.commit();

    return NextResponse.json({
      success: true,
      pairs,
      byePlayer,
      totalPairs: pairs.length,
      playerCount: alivePlayers.length,
    });
  } catch (error: any) {
    console.error("Create pairs error:", error);
    return NextResponse.json(
      { error: "Pairing failed", detail: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
