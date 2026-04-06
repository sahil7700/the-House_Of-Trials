import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, writeBatch, doc, increment } from "firebase/firestore";

interface BiddingSurvivalConfig {
  eliminationMode: "fixed" | "percentage";
  eliminationValue: number;
  penalty?: {
    type: "points" | "coins" | "none";
    amount: number;
  };
}

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, gameId, config } = await req.json();

    if (!slotNumber || gameId !== "B6") {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    if (!config) {
      return NextResponse.json({ error: "Missing config" }, { status: 400 });
    }

    const { eliminationMode = "fixed", eliminationValue = 1, penalty } = config as BiddingSurvivalConfig;

    const submissionsRef = collection(db, "submissions");
    const q = query(submissionsRef, where("slotNumber", "==", slotNumber));
    const snapshot = await getDocs(q);

    const submissions = snapshot.docs.map(d => ({
      id: d.id,
      playerId: d.data().playerId,
      bid: Number(d.data().value || 0),
      ref: d.ref
    }));

    if (submissions.length === 0) {
      return NextResponse.json({ error: "No submissions found for this round. Make sure players have submitted their bids." }, { status: 404 });
    }

    const sorted = [...submissions].sort((a, b) => a.bid - b.bid);

    let elimCount = 0;
    if (eliminationMode === "percentage") {
      elimCount = Math.floor(sorted.length * (eliminationValue / 100));
    } else {
      elimCount = eliminationValue;
    }

    elimCount = Math.min(elimCount, Math.max(0, sorted.length - 1));
    if (elimCount < 0) elimCount = 0;

    const cutOffBid = elimCount > 0 ? sorted[elimCount - 1].bid : 0;

    const eliminated = sorted.filter(s => s.bid <= cutOffBid && elimCount > 0);
    let eliminatedIds = eliminated.map(s => s.playerId);

    if (eliminatedIds.length >= sorted.length) {
      const highestBidder = sorted[sorted.length - 1];
      eliminatedIds = eliminatedIds.filter(id => id !== highestBidder.playerId);
    }

    const highestBid = sorted[sorted.length - 1].bid;
    const highestBidders = sorted.filter(s => s.bid === highestBid);

    const histogram: Record<number, number> = {};
    for (let i = 1; i <= 100; i++) histogram[i] = 0;
    sorted.forEach(s => {
      histogram[s.bid] = (histogram[s.bid] || 0) + 1;
    });

    const highestBidderIds = highestBidders.map(s => s.playerId);

    // Write eliminations to player docs
    const batch = writeBatch(db);

    eliminatedIds.forEach(playerId => {
      batch.update(doc(db, "players", playerId), {
        status: "eliminated",
        pointsDelta: -20,
        eliminationReason: "bidding_survival",
      });
    });

    // Update submissions count on gameState
    batch.update(doc(db, "system", "gameState"), {
      submissionsCount: increment(submissions.length),
    });

    await batch.commit();

    const results = {
      cutOffBid,
      elimCount,
      highestBid,
      highestBidderIds,
      penaltyApplied: penalty,
      histogram,
      eliminatedCount: eliminatedIds.length,
      survivedCount: sorted.length - eliminatedIds.length
    };

    return NextResponse.json({ success: true, results, eliminatedPlayerIds: eliminatedIds });
  } catch (error: any) {
    console.error("B6 Calculate Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
