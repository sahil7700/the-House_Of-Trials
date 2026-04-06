import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { slotNumber, numSellers, numGoldCards, numLeadCards, cardFlashSeconds, tradingSeconds } = await req.json();

    if (!slotNumber) {
      return NextResponse.json({ error: "Missing slotNumber" }, { status: 400 });
    }

    const aliveQ = query(collection(db, "players"), where("status", "==", "alive"));
    const aliveSnap = await getDocs(aliveQ);

    if (aliveSnap.empty) {
      return NextResponse.json({ error: "No alive players found" }, { status: 400 });
    }

    const totalAlive = aliveSnap.size;

    if (numSellers < 1) {
      return NextResponse.json({ error: "Must have at least 1 seller" }, { status: 400 });
    }
    if (numSellers > totalAlive - 1) {
      return NextResponse.json({ error: "Not enough buyers. Need at least 1 buyer." }, { status: 400 });
    }

    const shuffled = [...aliveSnap.docs].sort(() => Math.random() - 0.5);
    const sellerDocs = shuffled.slice(0, numSellers);
    const buyerDocs = shuffled.slice(numSellers);

    const goldSellerDocs = sellerDocs.slice(0, numGoldCards);
    const leadSellerDocs = sellerDocs.slice(numGoldCards);

    const batch = writeBatch(db);

    // Assign sellers
    sellerDocs.forEach(pDoc => {
      const isGold = goldSellerDocs.some(d => d.id === pDoc.id);
      batch.update(pDoc.ref, {
        marketRole: "seller",
        marketCard: isGold ? "gold" : "lead",
        marketCardSeen: false,
        marketTradeId: null,
        marketTradesReceived: 0,
        marketTradesAccepted: 0,
      });
    });

    // Assign buyers
    buyerDocs.forEach(pDoc => {
      batch.update(pDoc.ref, {
        marketRole: "buyer",
        marketCard: null,
        marketCardSeen: false,
        marketTradeId: null,
        marketTradesReceived: 0,
        marketTradesAccepted: 0,
      });
    });

    // Update gameState
    batch.update(doc(db, "system", "gameState"), {
      phase: "roles_assigned",
      marketConfig: {
        numSellers,
        numGoldCards,
        numLeadCards,
        cardFlashSeconds: cardFlashSeconds || 2,
        tradingSeconds: tradingSeconds || 300,
        maxTradesPerBuyer: 1,
        maxTradesPerSeller: 1,
        pointsBuyerGold: 80,
        pointsBuyerLead: 0,
        pointsSellerSold: 60,
        pointsSellerUnsold: 20,
      },
      marketRoles: {
        sellers: sellerDocs.map(d => d.id),
        buyers: buyerDocs.map(d => d.id),
      },
      revealStep: 0,
      pendingEliminations: [],
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      sellers: sellerDocs.map(d => ({ id: d.id, name: d.data().name, card: goldSellerDocs.some(g => g.id === d.id) ? "gold" : "lead" })),
      buyers: buyerDocs.map(d => ({ id: d.id, name: d.data().name })),
    });
  } catch (error: any) {
    console.error("Assign roles error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
