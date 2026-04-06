import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { buyerId, sellerId, slotNumber } = await req.json();

    if (!buyerId || !sellerId || !slotNumber) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (buyerId === sellerId) {
      return NextResponse.json({ error: "You cannot trade with yourself." }, { status: 400 });
    }

    // Check game phase
    const gameStateSnap = await getDoc(doc(db, "system", "gameState"));
    if (!gameStateSnap.exists()) {
      return NextResponse.json({ error: "No active game" }, { status: 400 });
    }
    const gameState = gameStateSnap.data();
    if (gameState.phase !== "trading_open") {
      return NextResponse.json({ error: "Trading is not open." }, { status: 400 });
    }

    // Check buyer
    const buyerSnap = await getDoc(doc(db, "players", buyerId));
    if (!buyerSnap.exists()) {
      return NextResponse.json({ error: "Buyer not found." }, { status: 400 });
    }
    const buyerData = buyerSnap.data();
    if (buyerData.marketRole !== "buyer") {
      return NextResponse.json({ error: "You are not a buyer in this round." }, { status: 400 });
    }
    if (buyerData.marketTradeId) {
      return NextResponse.json({ error: "You already have a confirmed trade." }, { status: 400 });
    }

    // Check existing pending request from this buyer
    const pendingQ = query(
      collection(db, "marketTrades"),
      where("buyerId", "==", buyerId),
      where("slotNumber", "==", slotNumber),
      where("status", "==", "pending")
    );
    const pendingSnap = await getDocs(pendingQ);
    if (!pendingSnap.empty) {
      return NextResponse.json({ error: "You already have a pending trade request." }, { status: 400 });
    }

    // Check seller
    const sellerSnap = await getDoc(doc(db, "players", sellerId));
    if (!sellerSnap.exists()) {
      return NextResponse.json({ error: "Seller not found." }, { status: 400 });
    }
    const sellerData = sellerSnap.data();
    if (sellerData.marketRole !== "seller") {
      return NextResponse.json({ error: `Player ${sellerId} is not a Seller in this round.` }, { status: 400 });
    }
    if ((sellerData.marketTradesAccepted || 0) >= 1) {
      return NextResponse.json({ error: `Seller ${sellerId} has already completed a trade.` }, { status: 400 });
    }

    // Expire old pending requests from this buyer
    const oldQ = query(
      collection(db, "marketTrades"),
      where("buyerId", "==", buyerId),
      where("slotNumber", "==", slotNumber),
      where("status", "==", "pending")
    );
    const oldSnap = await getDocs(oldQ);
    const { writeBatch } = await import("firebase/firestore");
    const expireBatch = writeBatch(db);
    oldSnap.forEach(d => expireBatch.update(d.ref, { status: "expired", resolvedAt: serverTimestamp() }));
    await expireBatch.commit();

    // Create trade
    const tradeRef = await addDoc(collection(db, "marketTrades"), {
      slotNumber,
      buyerId,
      buyerName: buyerData.name || buyerId,
      sellerId,
      sellerName: sellerData.name || sellerId,
      status: "pending",
      createdAt: serverTimestamp(),
      resolvedAt: null,
      cardType: null,
    });

    return NextResponse.json({ success: true, tradeId: tradeRef.id });
  } catch (error: any) {
    console.error("Send trade request error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
