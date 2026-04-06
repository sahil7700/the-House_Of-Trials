import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { tradeId, sellerId, response } = await req.json();

    if (!tradeId || !sellerId || !["accepted", "rejected", "expired"].includes(response)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const tradeRef = doc(db, "marketTrades", tradeId);
    const tradeSnap = await getDoc(tradeRef);

    if (!tradeSnap.exists()) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    const trade = tradeSnap.data();

    if (trade.sellerId !== sellerId) {
      return NextResponse.json({ error: "You are not the seller on this trade." }, { status: 403 });
    }
    if (trade.status !== "pending") {
      return NextResponse.json({ error: "Trade is no longer pending." }, { status: 400 });
    }

    const gameStateSnap = await getDoc(doc(db, "system", "gameState"));
    if (!gameStateSnap.exists() || gameStateSnap.data().phase !== "trading_open") {
      return NextResponse.json({ error: "Trading is not open." }, { status: 400 });
    }

    const batch = writeBatch(db);

    batch.update(tradeRef, {
      status: response,
      resolvedAt: serverTimestamp(),
    });

    if (response === "accepted") {
      batch.update(doc(db, "players", trade.buyerId), {
        marketTradeId: tradeId,
      });
      batch.update(doc(db, "players", trade.sellerId), {
        marketTradesAccepted: (trade.sellerName ? 1 : 0) + 1,
      });
    }

    await batch.commit();

    return NextResponse.json({ success: true, status: response });
  } catch (error: any) {
    console.error("Respond to trade error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
