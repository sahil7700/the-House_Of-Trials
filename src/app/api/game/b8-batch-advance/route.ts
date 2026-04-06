import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 2000;

interface AdvanceRequest {
  gameId: string;
  gameSpecificConfig: any;
}

export async function POST(req: NextRequest) {
  try {
    const body: AdvanceRequest = await req.json();
    const { gameSpecificConfig } = body;

    if (!gameSpecificConfig) {
      return NextResponse.json({ error: "Missing gameSpecificConfig" }, { status: 400 });
    }

    const queue: string[] = gameSpecificConfig.queue || [];
    const signals: Record<string, string> = gameSpecificConfig.signals || {};
    const publicFeed: any[] = gameSpecificConfig.publicFeed || [];
    const currentBatchIndex: number = gameSpecificConfig.currentBatchIndex ?? 0;
    const phase = gameSpecificConfig.phase || "active";

    if (phase !== "active") {
      return NextResponse.json({ error: "Game is not active", currentBatchIndex, totalBatches: Math.ceil(queue.length / BATCH_SIZE) });
    }

    const startIdx = currentBatchIndex * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, queue.length);

    if (startIdx >= queue.length) {
      return NextResponse.json({
        done: true,
        currentBatchIndex,
        nextBatchIndex: currentBatchIndex,
        phase: "locked",
        message: "All batches processed"
      });
    }

    const batch = writeBatch(db);

    const newFeed = [...publicFeed];

    for (let i = startIdx; i < endIdx; i++) {
      const playerId = queue[i];
      const signal = signals[playerId] || "RED";
      const choice = signal;
      newFeed.push({
        playerId,
        choice,
        batchIndex: currentBatchIndex,
        processedAt: new Date().toISOString(),
        autoAdvanced: true,
      });
      batch.update(doc(db, "players", playerId), {
        currentSubmission: choice,
        b8BatchProcessed: currentBatchIndex,
      });
    }

    const nextBatchIndex = currentBatchIndex + 1;
    const isFinished = nextBatchIndex * BATCH_SIZE >= queue.length;

    batch.update(doc(db, "system", "gameState"), {
      "gameSpecificConfig.publicFeed": newFeed,
      "gameSpecificConfig.currentBatchIndex": nextBatchIndex,
      phase: isFinished ? "locked" : "active",
    });

    await batch.commit();

    return NextResponse.json({
      done: isFinished,
      currentBatchIndex,
      nextBatchIndex,
      processedCount: endIdx - startIdx,
      phase: isFinished ? "locked" : "active",
      feedLength: newFeed.length,
      totalQueue: queue.length,
      totalBatches: Math.ceil(queue.length / BATCH_SIZE),
    });
  } catch (error: any) {
    console.error("B8 Batch Advance Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
