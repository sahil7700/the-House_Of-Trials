import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber } = await req.json();

    const tradesQ = query(collection(db, "marketTrades"), where("slotNumber", "==", slotNumber));
    const tradesSnap = await getDocs(tradesQ);
    const trades: any[] = tradesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const gameStateSnap = await getDoc(doc(db, "system", "gameState"));
    const gameState = gameStateSnap.data();
    const config = gameState?.marketConfig || {};

    const pointsBuyerGold = config.pointsBuyerGold ?? 80;
    const pointsSellerSold = config.pointsSellerSold ?? 60;
    const pointsSellerUnsold = config.pointsSellerUnsold ?? 20;

    const batch = writeBatch(db);
    const pendingEliminations: string[] = [];
    const results: any[] = [];

    // Process accepted trades
    for (const trade of trades) {
      if (trade.status !== "accepted") continue;

      const sellerSnap = await getDoc(doc(db, "players", trade.sellerId));
      const seller = sellerSnap.data();

      const cardType = seller?.marketCard || "lead";

      batch.update(doc(db, "marketTrades", trade.id), { cardType });

      if (cardType === "lead") {
        pendingEliminations.push(trade.buyerId);
        batch.update(doc(db, "players", trade.buyerId), {
          points: (trade.buyerId ? 0 : 0),
          pendingElimination: true,
          eliminationReason: "market_of_lemons",
        });
        results.push({
          buyerId: trade.buyerId,
          buyerName: trade.buyerName,
          sellerId: trade.sellerId,
          sellerName: trade.sellerName,
          cardType,
          outcome: "eliminated",
        });
      } else {
        batch.update(doc(db, "players", trade.buyerId), { points: pointsBuyerGold });
        results.push({
          buyerId: trade.buyerId,
          buyerName: trade.buyerName,
          sellerId: trade.sellerId,
          sellerName: trade.sellerName,
          cardType,
          outcome: "safe",
          pointsAwarded: pointsBuyerGold,
        });
      }

      // Seller always gets points
      const currentSellerPoints = sellerSnap.data()?.points || 0;
      batch.update(doc(db, "players", trade.sellerId), {
        points: currentSellerPoints + pointsSellerSold,
      });
    }

    // Buyers with no trade are safe
    const marketRoles = gameState?.marketRoles || {};
    const buyers: string[] = marketRoles.buyers || [];
    for (const buyerId of buyers) {
      const buyerTrade = trades.find(t => t.buyerId === buyerId && t.status === "accepted");
      if (!buyerTrade) {
        results.push({
          buyerId,
          buyerName: "Unknown",
          sellerId: null,
          sellerName: null,
          cardType: null,
          outcome: "no_trade",
        });
      }
    }

    // Sellers who didn't sell get partial points
    const sellers: string[] = marketRoles.sellers || [];
    for (const sellerId of sellers) {
      const acceptedTrade = trades.find(t => t.sellerId === sellerId && t.status === "accepted");
      if (!acceptedTrade) {
        const sellerSnap = await getDoc(doc(db, "players", sellerId));
        const currentSellerPoints = sellerSnap.data()?.points || 0;
        batch.update(doc(db, "players", sellerId), {
          points: currentSellerPoints + pointsSellerUnsold,
        });
      }
    }

    batch.update(doc(db, "system", "gameState"), {
      pendingEliminations,
      phase: "reveal",
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      eliminatedCount: pendingEliminations.length,
      totalTrades: trades.filter(t => t.status === "accepted").length,
      results,
    });
  } catch (error: any) {
    console.error("Calculate error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
