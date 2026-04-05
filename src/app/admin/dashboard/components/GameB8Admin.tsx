import { useState } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { motion } from "framer-motion";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

export default function GameB8Admin({ gameState, players, onUpdateGameState }: Props) {
  const [redBias, setRedBias] = useState(60);
  const [sequenceLength, setSequenceLength] = useState(0); // 0 = use all alive players

  const alivePlayers = players.filter(p => p.status === "alive");
  const gsc = (gameState as any).gameSpecificConfig || {};
  const queue: string[] = gsc.queue || [];
  const signals: Record<string, string> = gsc.signals || {};
  const publicFeed: any[] = gsc.publicFeed || [];
  const currentTurnIndex: number = gsc.currentTurnIndex ?? 0;
  const trueMajority: string = gsc.trueMajority || "UNKNOWN";
  const isLobby = gameState.phase === "lobby";
  const isActive = gameState.phase === "active";
  const isLocked = gameState.phase === "locked";

  // ── GENERATE SIGNALS & QUEUE ──
  const handleGenerateGame = () => {
    if (!onUpdateGameState) return;

    const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
    // Sequence length: use all players if 0 is set, otherwise cap at sequenceLength
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
        currentTurnIndex: 0,
      }
    } as any);
  };

  // ── START GAME (move to active) ──
  const handleStartGame = () => {
    if (!onUpdateGameState || queue.length === 0) return;
    onUpdateGameState({ phase: "active" } as any);
  };

  // ── MANUAL ADVANCE (admin override — skip stuck player) ──
  const handleManualAdvance = async () => {
    if (!onUpdateGameState || currentTurnIndex >= queue.length) return;

    const stuckPlayerId = queue[currentTurnIndex];
    const stuckPlayer = alivePlayers.find(p => p.id === stuckPlayerId);

    // Auto-submit their signal as their choice (they opted out)
    const defaultChoice = signals[stuckPlayerId] || "RED";
    const newFeed = [...publicFeed, {
      playerId: stuckPlayerId,
      playerName: stuckPlayer?.name || stuckPlayerId,
      choice: defaultChoice,
      autoAdvanced: true,
    }];

    const nextIndex = currentTurnIndex + 1;
    const isFinished = nextIndex >= queue.length;

    // Update player submission
    if (stuckPlayerId) {
      await updateDoc(doc(db, "players", stuckPlayerId), { currentSubmission: defaultChoice });
    }

    onUpdateGameState({
      phase: isFinished ? "locked" : "active",
      gameSpecificConfig: {
        ...gsc,
        publicFeed: newFeed,
        currentTurnIndex: nextIndex,
      }
    } as any);
  };

  // ── REVEAL ──
  const handleReveal = () => {
    if (!onUpdateGameState) return;

    const eliminatedPlayerIds: string[] = [];
    const pointsDeltaMap: Record<string, number> = {};

    alivePlayers.forEach(p => {
      const choice = p.currentSubmission;
      const isRight = choice === trueMajority;
      if (!isRight) eliminatedPlayerIds.push(p.id);
      pointsDeltaMap[p.id] = isRight ? 20 : -20;
    });

    onUpdateGameState({
      phase: "reveal",
      results: {
        trueMajority,
        eliminatedPlayerIds,
        pointsDeltaMap,
        publicFeed,
      }
    } as any);
  };

  const currentActiveName = alivePlayers.find(p => p.id === queue[currentTurnIndex])?.name || queue[currentTurnIndex] || "—";
  const redInFeed = publicFeed.filter(f => f.choice === "RED").length;
  const blueInFeed = publicFeed.filter(f => f.choice === "BLUE").length;

  // ── LOBBY ──
  if (isLobby) {
    return (
      <div className="w-full space-y-6 border border-secondary/40 bg-secondary/5 p-6">
        <h3 className="text-sm text-secondary font-bold uppercase tracking-widest">Information Cascade — Setup</h3>

        {/* Signal bias */}
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
          <p className="text-[10px] text-textMuted">
            True majority will be {redBias > 50 ? "RED" : "BLUE"} (but it's decided by actual random draw, not guaranteed)
          </p>
        </div>

        {/* Sequence length */}
        <div className="space-y-2">
          <label className="text-[10px] text-textMuted uppercase tracking-widest block">
            Sequence Length (0 = all {alivePlayers.length} alive players)
          </label>
          <input type="number" min="0" max={alivePlayers.length} value={sequenceLength}
            onChange={e => setSequenceLength(+e.target.value)}
            className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary" />
          <p className="text-[10px] text-textMuted">
            {sequenceLength === 0 ? `All ${alivePlayers.length} players will vote in random order` : `Only ${Math.min(sequenceLength, alivePlayers.length)} players will be in the cascade sequence`}
          </p>
        </div>

        {/* Generate button */}
        <button onClick={handleGenerateGame}
          className="w-full py-3 bg-secondary/20 border border-secondary text-secondary uppercase tracking-widest text-xs font-bold hover:bg-secondary hover:text-background transition-colors">
          Generate Signals &amp; Shuffle Queue
        </button>

        {/* Preview generated signals */}
        {queue.length > 0 && (
          <div className="space-y-3">
            <div className="border border-border bg-surface p-4">
              <p className="text-[10px] text-textMuted uppercase tracking-widest mb-3">Generated Signals Preview</p>
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
              <p className="text-xs text-center text-textMuted">True Majority: <span className={`font-bold ${trueMajority === "RED" ? "text-primary" : "text-blue-400"}`}>{trueMajority}</span></p>
              <p className="text-[10px] text-textMuted text-center mt-1">{queue.length} players in sequence</p>
            </div>

            <button onClick={handleStartGame}
              className="w-full py-4 bg-primary/20 border border-primary text-primary uppercase tracking-widest font-bold hover:bg-primary hover:text-white transition-colors shadow-glow-red">
              START CASCADE →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── ACTIVE / LOCKED ──
  return (
    <div className="w-full space-y-4">
      {/* Stats row */}
      <div className="border border-border bg-surface p-4 grid grid-cols-4 gap-4 text-center text-xs">
        <div>
          <p className="text-[10px] text-textMuted uppercase mb-1">True Majority</p>
          <p className={`text-xl font-bold ${trueMajority === "RED" ? "text-primary" : "text-blue-400"}`}>{trueMajority}</p>
        </div>
        <div>
          <p className="text-[10px] text-textMuted uppercase mb-1">Progress</p>
          <p className="text-xl font-mono">{currentTurnIndex}/{queue.length}</p>
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

      {/* Current turn indicator */}
      {isActive && currentTurnIndex < queue.length && (
        <div className="border border-secondary bg-secondary/10 p-4 flex justify-between items-center">
          <div>
            <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Current Turn</p>
            <p className="text-secondary font-bold uppercase tracking-widest">#{currentTurnIndex + 1} — {currentActiveName}</p>
          </div>
          <button onClick={handleManualAdvance}
            className="px-4 py-2 border border-primary text-primary text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-colors">
            Skip / Auto-Submit
          </button>
        </div>
      )}

      {/* Vote progress bar */}
      {(redInFeed + blueInFeed) > 0 && (
        <div className="border border-border bg-surface p-4 space-y-2">
          <p className="text-[10px] text-textMuted uppercase tracking-widest">Cascade Vote Split</p>
          <div className="flex h-6 w-full overflow-hidden border border-border">
            <motion.div className="h-full bg-primary" animate={{ width: `${(redInFeed / (redInFeed + blueInFeed)) * 100}%` }} transition={{ duration: 0.4 }} />
            <motion.div className="h-full bg-blue-500" animate={{ width: `${(blueInFeed / (redInFeed + blueInFeed)) * 100}%` }} transition={{ duration: 0.4 }} />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-primary">{redInFeed} RED ({Math.round((redInFeed / Math.max(redInFeed + blueInFeed, 1)) * 100)}%)</span>
            <span className="text-blue-400">{blueInFeed} BLUE ({Math.round((blueInFeed / Math.max(redInFeed + blueInFeed, 1)) * 100)}%)</span>
          </div>
        </div>
      )}

      {/* Live feed log */}
      <div className="border border-border bg-surface p-4 max-h-52 overflow-y-auto space-y-1">
        <p className="text-[10px] text-textMuted uppercase tracking-widest mb-2">Decision Log</p>
        {publicFeed.map((f, i) => (
          <div key={i} className="flex justify-between items-center p-2 border-b border-border/30 text-xs font-mono">
            <span className="text-textMuted">#{i + 1} {f.playerName}{f.autoAdvanced ? " ⚡" : ""}</span>
            <span className={`font-bold ${f.choice === "RED" ? "text-primary" : "text-blue-400"}`}>{f.choice}</span>
          </div>
        ))}
        {isActive && currentTurnIndex < queue.length && (
          <div className="flex justify-between items-center p-2 border-b border-secondary/30 text-xs font-mono text-secondary animate-pulse">
            <span>#{currentTurnIndex + 1} {currentActiveName}</span>
            <span>Deciding...</span>
          </div>
        )}
      </div>

      {/* Locked → Reveal button */}
      {isLocked && (
        <button onClick={handleReveal}
          className="w-full py-3 border border-secondary text-secondary uppercase tracking-widest text-xs font-bold hover:bg-secondary hover:text-background transition-colors shadow-glow-gold">
          REVEAL TRUE MAJORITY &amp; ELIMINATE
        </button>
      )}
    </div>
  );
}
