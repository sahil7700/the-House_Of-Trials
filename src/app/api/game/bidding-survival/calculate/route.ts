import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

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

    if (!slotNumber || gameId !== "B6" || !config) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { eliminationMode, eliminationValue, penalty } = config as BiddingSurvivalConfig;

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
      return NextResponse.json({ results: { message: "No submissions" }, eliminatedPlayerIds: [] });
    }

    // Sort bids ascending
    const sorted = [...submissions].sort((a, b) => a.bid - b.bid);

    // Calculate elimination count
    let elimCount = 0;
    if (eliminationMode === "percentage") {
      elimCount = Math.floor(sorted.length * (eliminationValue / 100));
    } else {
      elimCount = eliminationValue;
    }

    // Safety: never eliminate everyone (min 1 survivor), cap at all but 1
    elimCount = Math.min(elimCount, Math.max(0, sorted.length - 1));
    if (elimCount < 0) elimCount = 0;

    // Find cutoff: the bid value at the elimination boundary
    // Players at or below this bid value are eliminated
    const cutOffBid = elimCount > 0 ? sorted[elimCount - 1].bid : 0;

    // Include ALL players with bids at or below the cutoff
    // This handles ties properly (all tied at cutoff are eliminated together)
    const eliminated = sorted.filter(s => s.bid <= cutOffBid && elimCount > 0);
    const eliminatedIds = eliminated.map(s => s.playerId);

    // Ensure at least someone survives (safety net)
    let finalEliminatedIds = eliminatedIds;
    if (eliminatedIds.length >= sorted.length) {
      // Remove the highest bidder from elimination as safety net
      const highestBidder = sorted[sorted.length - 1];
      finalEliminatedIds = eliminatedIds.filter(id => id !== highestBidder.playerId);
    }

    // Highest bid
    const highestBid = sorted[sorted.length - 1].bid;
    const highestBidders = sorted.filter(s => s.bid === highestBid);

    // Histogram
    const histogram: Record<number, number> = {};
    for (let i = 1; i <= 100; i++) histogram[i] = 0;
    sorted.forEach(s => {
      histogram[s.bid] = (histogram[s.bid] || 0) + 1;
    });

    const highestBidderIds = highestBidders.map(s => s.playerId);
    const results = {
      cutOffBid,
      elimCount,
      highestBid,
      highestBidderIds,
      penaltyApplied: penalty,
      histogram,
      eliminatedCount: finalEliminatedIds.length,
      survivedCount: sorted.length - finalEliminatedIds.length
    };

    return NextResponse.json({ success: true, results, eliminatedPlayerIds: finalEliminatedIds });
  } catch (error: any) {
    console.error("Calculate Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
