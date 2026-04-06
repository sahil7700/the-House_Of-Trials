import { useState, useEffect, useRef } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { db } from "@/lib/firebase";
import { doc, writeBatch } from "firebase/firestore";
import { motion } from "framer-motion";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

const BATCH_SIZE = 20;

export default function GameB8Admin({ gameState, players, onUpdateGameState }: Props) {
  const alivePlayers = players.filter(p => p.status === "alive");
  const gsc = (gameState as any).gameSpecificConfig || {};
  const queue: string[] = gsc.queue || [];
  const signals: Record<string, string> = gsc.signals || {};
  const publicFeed: any[] = gsc.publicFeed || [];
  const currentBatchIndex: number = gsc.currentBatchIndex ?? 0;
  const trueMajority: string = gsc.trueMajority || "UNKNOWN";
  const isLobby = gameState.phase === "lobby";
  const isActive = gameState.phase === "active";
  const isLocked = gameState.phase === "locked";

  const [redBias, setRedBias] = useState(60);
  const [sequenceLength, setSequenceLength] = useState(0);
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [batchIntervalSec, setBatchIntervalSec] = useState(2);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [lastBatchResult, setLastBatchResult] = useState<any>(null);

  const totalBatches = Math.ceil(queue.length / BATCH_SIZE);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const advanceBatch = async () => {
    if (advancing || isLocked || !onUpdateGameState) return;
    setAdvancing(true);
    try {
      const res = await fetch("/api/game/b8-batch-advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: "B8",
          gameSpecificConfig: {
            ...gsc,
            phase: gameState.phase,
          },
        }),
      });
      const data = await res.json();
      setLastBatchResult(data);

      if (data.done) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setAutoAdvancing(false);
        if (onUpdateGameState) {
          onUpdateGameState({ phase: "locked" } as any);
        }
      } else {
        if (onUpdateGameState) {
          onUpdateGameState({
            phase: "active",
            gameSpecificConfig: {
              ...gsc,
              publicFeed: publicFeed,
              currentBatchIndex: data.nextBatchIndex,
              phase: "active",
            },
          } as any);
        }
      }
    } catch (e) {
      console.error("Batch advance failed:", e);
    } finally {
      setAdvancing(false);
    }
  };

  const startAutoAdvance = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setAutoAdvancing(true);
    advanceBatch();
    intervalRef.current = setInterval(advanceBatch, batchIntervalSec * 1000);
  };

  const stopAutoAdvance = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAutoAdvancing(false);
  };

  const handleGenerateGame = () => {
    if (!onUpdateGameState) return;

    const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
    const participants = sequenceLength > 0
      ? shuffled.slice(0, Math.min(sequenceLength, shuffled.length))
      : shuffled;

    const newQueue = participants.map(p => p.id);
    const newSignals: Record<string, string> = {};
    let redCount = 0;

    participants.forEach(p => {
      const isRed = Math.random() * 100 < redBias;
      if (isRed) redCount++;
      newSignals[p.id] = isRed ? "RED" : "BLUE";
    });

    const actualMajority = redCount > participants.length / 2 ? "RED" : "BLUE";

    onUpdateGameState({
      gameSpecificConfig: {
        ...gsc,
        queue: newQueue,
        signals: newSignals,
        trueMajority: actualMajority,
        bias: redBias,
        publicFeed: [],
        currentBatchIndex: 0,
        totalBatches: Math.ceil(newQueue.length / BATCH_SIZE),
      },
    } as any);
  };

  const handleStartGame = () => {
    if (!onUpdateGameState || queue.length === 0) return;
    onUpdateGameState({ phase: "active" } as any);
  };

  const handleReveal = async () => {
    if (!onUpdateGameState) return;

    const eliminatedPlayerIds: string[] = [];
    const pointsDeltaMap: Record<string, number> = {};
    const batch = writeBatch(db);

    alivePlayers.forEach(p => {
      if (queue.includes(p.id)) {
        const choice = p.currentSubmission;
        const isRight = choice === trueMajority;
        if (!isRight) eliminatedPlayerIds.push(p.id);
        pointsDeltaMap[p.id] = isRight ? 20 : -20;
        batch.update(doc(db, "players", p.id), {
          status: isRight ? "alive" : "eliminated",
          pointsDelta: isRight ? 20 : -20,
        });
      } else {
        pointsDeltaMap[p.id] = 0;
      }
    });

    await batch.commit();

    onUpdateGameState({
      phase: "reveal",
      results: {
        trueMajority,
        eliminatedPlayerIds,
        pointsDeltaMap,
        publicFeed,
        queueLength: queue.length,
      },
    } as any);
  };

  const currentProcessedCount = publicFeed.length;
  const redInFeed = publicFeed.filter(f => f.choice === "RED").length;
  const blueInFeed = publicFeed.filter(f => f.choice === "BLUE").length;

  if (isLobby) {
    return (
      <div className="w-full space-y-6 border border-secondary/40 bg-secondary/5 p-6">
        <h3 className="text-sm text-secondary font-bold uppercase tracking-widest">Information Cascade — Setup</h3>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-textMuted uppercase tracking-widest">Signal Distribution</span>
            <span className="text-[10px] font-mono text-textDefault">{redBias}% RED · {100 - redBias}% BLUE</span>
          </div>
          <input type="range" min="10" max="90" step="5" value={redBias} onChange={e => setRedBias(+e.target.value)}
            className="w-full accent-primary" />
          <div className="flex justify-between text-xs">
            <span className="text-primary font-bold">RED ({redBias}%)</span>
            <span className="text-blue-400 font-bold">BLUE ({100 - redBias}%)</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-textMuted uppercase tracking-widest block">
            Cascade Size (0 = all {alivePlayers.length} alive players)
          </label>
          <input type="number" min="0" max={alivePlayers.length} value={sequenceLength}
            onChange={e => setSequenceLength(+e.target.value)}
            className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary" />
        </div>

        <button onClick={handleGenerateGame}
          className="w-full py-3 bg-secondary/20 border border-secondary text-secondary uppercase tracking-widest text-xs font-bold hover:bg-secondary hover:text-background transition-colors">
          Generate Signals &amp; Shuffle Queue
        </button>

        {queue.length > 0 && (
          <div className="space-y-3">
            <div className="border border-border bg-surface p-4">
              <p className="text-[10px] text-textMuted uppercase tracking-widest mb-3">Signal Preview</p>
              <div className="grid grid-cols-2 gap-2 mb-3 text-center">
                <div className="border border-primary/40 bg-primary/5 p-3">
                  <p className="text-primary font-bold text-xl">{Object.values(signals).filter(s => s === "RED").length}</p>
                  <p className="text-[10px] text-textMuted uppercase">RED signals</p>
                </div>
                <div className="border border-blue-500/40 bg-blue-900/10 p-3">
                  <p className="text-blue-400 font-bold text-xl">{Object.values(signals).filter(s => s === "BLUE").length}</p>
                  <p className="text-[10px] text-textMuted uppercase">BLUE signals</p>
                </div>
              </div>
              <p className="text-xs text-center text-textMuted">
                True Majority: <span className={`font-bold ${trueMajority === "RED" ? "text-primary" : "text-blue-400"}`}>{trueMajority}</span>
              </p>
              <p className="text-[10px] text-textMuted text-center mt-1">{queue.length} players · {totalBatches} batches of {BATCH_SIZE}</p>
            </div>

            <button onClick={handleStartGame}
              className="w-full py-4 bg-primary/20 border border-primary text-primary uppercase tracking-widest font-bold hover:bg-primary hover:text-white transition-colors shadow-glow-red">
              START CASCADE
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="border border-border bg-surface p-4 grid grid-cols-4 gap-4 text-center text-xs">
        <div>
          <p className="text-[10px] text-textMuted uppercase mb-1">True Majority</p>
          <p className={`text-xl font-bold ${trueMajority === "RED" ? "text-primary" : "text-blue-400"}`}>{trueMajority}</p>
        </div>
        <div>
          <p className="text-[10px] text-textMuted uppercase mb-1">Progress</p>
          <p className="text-xl font-mono">{currentProcessedCount}/{queue.length}</p>
        </div>
        <div>
          <p className="text-[10px] text-primary uppercase mb-1">RED votes</p>
          <p className="text-xl font-bold text-primary">{redInFeed}</p>
        </div>
        <div>
          <p className="text-[10px] text-blue-400 uppercase mb-1">BLUE votes</p>
          <p className="text-xl font-bold text-blue-400">{blueInFeed}</p>
        </div>
      </div>

      {isActive && (
        <div className="border border-border bg-surface p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-textMuted uppercase tracking-widest">Batch Progress</span>
            <span className="text-xs font-mono">Batch {currentBatchIndex + 1} / {totalBatches}</span>
          </div>
          <div className="w-full h-2 bg-background border border-border overflow-hidden">
            <motion.div
              className="h-full bg-secondary"
              animate={{ width: `${(currentProcessedCount / Math.max(queue.length, 1)) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] text-textMuted uppercase tracking-widest block">Batch Interval (sec)</label>
              <input
                type="number"
                min="1"
                max="30"
                value={batchIntervalSec}
                onChange={e => setBatchIntervalSec(Math.max(1, parseInt(e.target.value) || 2))}
                className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary"
                disabled={autoAdvancing}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-textMuted uppercase tracking-widest block">Players/Batch</label>
              <div className="bg-background border border-border px-3 py-2 text-sm text-textMuted">{BATCH_SIZE} (fixed)</div>
            </div>
          </div>

          <div className="flex gap-2">
            {!autoAdvancing ? (
              <button
                onClick={startAutoAdvance}
                className="flex-1 py-3 bg-secondary text-background font-bold uppercase tracking-widest text-xs hover:bg-white transition-colors shadow-glow-gold"
              >
                START AUTO CASCADE ({batchIntervalSec}s/batch)
              </button>
            ) : (
              <button
                onClick={stopAutoAdvance}
                className="flex-1 py-3 bg-primary text-white font-bold uppercase tracking-widest text-xs hover:bg-primary/80 transition-colors shadow-glow-red"
              >
                STOP CASCADE
              </button>
            )}
            <button
              onClick={advanceBatch}
              disabled={advancing || isLocked}
              className="px-4 py-3 border border-border text-textMuted uppercase tracking-widest text-xs hover:border-secondary hover:text-secondary transition-colors disabled:opacity-40"
            >
              {advancing ? "..." : "+1 Batch"}
            </button>
          </div>

          {lastBatchResult && (
            <p className="text-[10px] text-textMuted text-center">
              Last: batch {lastBatchResult.currentBatchIndex + 1} → {lastBatchResult.nextBatchIndex}, {lastBatchResult.processedCount} players, phase: {lastBatchResult.phase}
            </p>
          )}
        </div>
      )}

      {(redInFeed + blueInFeed) > 0 && (
        <div className="border border-border bg-surface p-4 space-y-2">
          <p className="text-[10px] text-textMuted uppercase tracking-widest">Cascade Vote Split</p>
          <div className="flex h-6 w-full overflow-hidden border border-border">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${(redInFeed / Math.max(redInFeed + blueInFeed, 1)) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
            <motion.div
              className="h-full bg-blue-500"
              animate={{ width: `${(blueInFeed / Math.max(redInFeed + blueInFeed, 1)) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-primary">{redInFeed} RED ({Math.round((redInFeed / Math.max(redInFeed + blueInFeed, 1)) * 100)}%)</span>
            <span className="text-blue-400">{blueInFeed} BLUE ({Math.round((blueInFeed / Math.max(redInFeed + blueInFeed, 1)) * 100)}%)</span>
          </div>
        </div>
      )}

      <div className="border border-border bg-surface p-4 max-h-52 overflow-y-auto space-y-1">
        <p className="text-[10px] text-textMuted uppercase tracking-widest mb-2">Decision Log</p>
        {publicFeed.length === 0 && (
          <p className="text-textMuted/50 text-center text-xs py-4 italic">Waiting for first batch...</p>
        )}
        {publicFeed.slice(-50).map((f, i) => {
          const globalIdx = publicFeed.length - 50 + i;
          return (
            <div key={globalIdx} className="flex justify-between items-center p-2 border-b border-border/30 text-xs font-mono">
              <span className="text-textMuted">#{globalIdx + 1} <span className="opacity-40">{f.playerId?.substring(0, 6)}</span>{f.autoAdvanced ? " ⚡" : ""}</span>
              <span className={`font-bold ${f.choice === "RED" ? "text-primary" : "text-blue-400"}`}>{f.choice}</span>
            </div>
          );
        })}
      </div>

      {isLocked && (
        <button onClick={handleReveal}
          className="w-full py-3 border border-secondary text-secondary uppercase tracking-widest text-xs font-bold hover:bg-secondary hover:text-background transition-colors shadow-glow-gold">
          REVEAL TRUE MAJORITY &amp; ELIMINATE
        </button>
      )}
    </div>
  );
}
