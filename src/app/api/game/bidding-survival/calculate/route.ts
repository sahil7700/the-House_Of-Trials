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

    // 1. Fetch all submissions for this slot
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

    // 2. Sort bids ascending
    const sorted = [...submissions].sort((a, b) => a.bid - b.bid);

    // 3. Apply elimination rule
    let cutOffIndex = 0;
    if (eliminationMode === "percentage") {
      cutOffIndex = Math.floor(sorted.length * (eliminationValue / 100));
    } else {
      cutOffIndex = eliminationValue;
    }

    // Make sure we never eliminate everyone unless strictly specified, but let's follow math
    if (cutOffIndex > sorted.length) cutOffIndex = sorted.length;

    // Handle ties at cutoff
    const cutOffBid = cutOffIndex > 0 ? sorted[cutOffIndex - 1].bid : 0;
    
    // Default tie breaker: eliminate all tied at the cutoff bid who are at or below
    // (If user wants advanced tie breaker, we'd add it to config, but for now we'll just eliminate anyone <= cutOffBid if they were in the bottom chunk)
    // Actually, "if tied at cutoff: eliminate ALL tied"
    const eliminated = sorted.filter(s => s.bid <= cutOffBid);
    const eliminatedIds = eliminated.map(s => s.playerId);

    // 4. Find highest bid - apply configured penalty
    const highestBid = sorted[sorted.length - 1].bid;
    const highestBidders = sorted.filter(s => s.bid === highestBid);
    
    // 5. Update submissions locally and prepare results
    const histogram: Record<number, number> = {};
    for (let i = 1; i <= 100; i++) histogram[i] = 0;

    sorted.forEach(s => {
      histogram[s.bid] = (histogram[s.bid] || 0) + 1;
    });

    const highestBidderIds = highestBidders.map(s => s.playerId);
    const results = {
      cutOffBid,
      highestBid,
      highestBidderIds,
      penaltyApplied: penalty,
      histogram,
      eliminatedCount: eliminated.length,
      survivedCount: sorted.length - eliminated.length
    };

    return NextResponse.json({ success: true, results, eliminatedPlayerIds: eliminatedIds });
  } catch (error: any) {
    console.error("Calculate Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
