import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, writeBatch, getDocs, collection } from "firebase/firestore";

interface AdvanceTurnRequest {
  playerId: string;
  slotNumber: number;
  gameId: string;
  choice: "RED" | "BLUE";
}

export async function POST(req: NextRequest) {
  try {
    const body: AdvanceTurnRequest = await req.json();
    const { playerId, slotNumber, gameId, choice } = body;

    if (!playerId || !slotNumber || gameId !== "B8" || !choice) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    if (!["RED", "BLUE"].includes(choice)) {
      return NextResponse.json({ error: "Invalid choice value" }, { status: 400 });
    }

    const gameStateRef = doc(db, "system", "gameState");
    const gameStateSnap = await getDoc(gameStateRef);

    if (!gameStateSnap.exists()) {
      return NextResponse.json({ error: "No active game state" }, { status: 404 });
    }

    const gameState = gameStateSnap.data();
    const gsc = gameState.gameSpecificConfig || {};
    const queue: string[] = gsc.queue || [];
    const currentTurnIndex: number = gsc.currentTurnIndex ?? 0;

    // Validate it's this player's turn
    if (currentTurnIndex >= queue.length) {
      return NextResponse.json({ error: "Cascade already finished" }, { status: 400 });
    }

    const currentPlayerId = queue[currentTurnIndex];
    if (currentPlayerId !== playerId) {
      return NextResponse.json({ error: "Not your turn" }, { status: 403 });
    }

    // Get player name for the feed
    const playerDoc = await getDoc(doc(db, "players", playerId));
    const playerData = playerDoc.data();
    const playerName = playerData?.name || `Player ${playerId.substring(0, 6)}`;

    const existingFeed = gsc.publicFeed || [];
    const newFeedEntry = {
      playerId,
      playerName,
      choice,
    };
    const newFeed = [...existingFeed, newFeedEntry];

    const nextIndex = currentTurnIndex + 1;
    const isFinished = nextIndex >= queue.length;

    // Fetch all players to determine true majority
    const playersSnap = await getDocs(collection(db, "players"));
    const alivePlayers = playersSnap.docs.filter(p => p.data().status === "alive");
    
    // Count choices in the queue from all submissions
    // (we already have them in the feed)
    const redCount = newFeed.filter((f: any) => f.choice === "RED").length;
    const blueCount = newFeed.filter((f: any) => f.choice === "BLUE").length;
    const trueMajority = redCount > blueCount ? "RED" : redCount < blueCount ? "BLUE" : (Math.random() > 0.5 ? "RED" : "BLUE");

    const batch = writeBatch(db);

    // Update the player submission
    batch.update(doc(db, "players", playerId), {
      currentSubmission: choice,
      submittedAt: new Date(),
    });

    // Update gameState with the new feed and turn index
    const updates: Record<string, any> = {
      "gameSpecificConfig.publicFeed": newFeed,
      "gameSpecificConfig.currentTurnIndex": nextIndex,
      "gameSpecificConfig.trueMajority": trueMajority,
    };

    if (isFinished) {
      updates.phase = "locked";
    }

    batch.update(gameStateRef, updates);

    await batch.commit();

    return NextResponse.json({
      success: true,
      feedLength: newFeed.length,
      currentIndex: nextIndex,
      isFinished,
      trueMajority,
    });
  } catch (error: any) {
    console.error("B8 Advance Turn Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
