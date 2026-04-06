import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, writeBatch, getDocs, query, where } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber } = await req.json();

    if (!slotNumber) {
      return NextResponse.json({ error: "slotNumber is required" }, { status: 400 });
    }

    console.log("[create-pairs] Starting for slot:", slotNumber);

    const playersSnap = await getDocs(
      query(collection(db, "players"), where("status", "==", "alive"))
    );
    const alivePlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log("[create-pairs] Found alive players:", alivePlayers.length);

    if (alivePlayers.length === 0) {
      return NextResponse.json({ error: "No alive players found", detail: "No players with status='alive' in database. Make sure players have joined and are marked 'alive'." }, { status: 404 });
    }

    if (alivePlayers.length < 2) {
      return NextResponse.json({ error: "Need at least 2 alive players to form pairs", detail: `Only ${alivePlayers.length} alive player(s) found.` }, { status: 400 });
    }

    const shuffled = [...alivePlayers].sort(() => 0.5 - Math.random());

    let byePlayer = null;
    let pairedPlayers = shuffled;

    if (shuffled.length % 2 !== 0) {
      const byeIndex = Math.floor(Math.random() * shuffled.length);
      byePlayer = shuffled.splice(byeIndex, 1)[0];
      console.log("[create-pairs] Bye player:", byePlayer?.id);
    }

    const pairs: any[] = [];
    const batch = writeBatch(db);

    for (let i = 0; i < pairedPlayers.length; i += 2) {
      const pairId = `pair_${String(slotNumber)}_${i / 2 + 1}`;
      const pair = {
        pairId,
        pairIndex: i / 2 + 1,
        slotNumber: Number(slotNumber),
        playerAId: pairedPlayers[i].id,
        playerAName: String(pairedPlayers[i].name || pairedPlayers[i].id),
        playerBId: pairedPlayers[i + 1].id,
        playerBName: String(pairedPlayers[i + 1].name || pairedPlayers[i + 1].id),
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
        createdAt: new Date().toISOString(),
      };
      pairs.push(pair);
      batch.set(doc(db, "sequencePairs", pairId), pair);
    }

    if (byePlayer) {
      const byePairId = `pair_${String(slotNumber)}_bye`;
      const byePair = {
        pairId: byePairId,
        pairIndex: pairs.length + 1,
        slotNumber: Number(slotNumber),
        playerAId: byePlayer.id,
        playerAName: String(byePlayer.name || byePlayer.id),
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
        createdAt: new Date().toISOString(),
      };
      pairs.push(byePair);
      batch.set(doc(db, "sequencePairs", byePairId), byePair);
    }

    batch.update(doc(db, "system", "gameState"), {
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

    await batch.commit();
    console.log("[create-pairs] Success. Created", pairs.length, "pairs. Bye:", byePlayer?.id || "none");

    return NextResponse.json({
      success: true,
      pairs,
      byePlayer,
      totalPairs: pairs.length,
      playerCount: alivePlayers.length,
    });
  } catch (error: any) {
    console.error("[create-pairs] Error:", error);
    return NextResponse.json(
      { error: "Pairing failed", detail: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
