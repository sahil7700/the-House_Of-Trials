import { useState, useEffect } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { motion } from "framer-motion";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

interface PairData {
  pairId: string;
  pairIndex: number;
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
  playerA_sequence: number[] | null;
  playerB_sequence: number[] | null;
  playerA_guess: number[] | null;
  playerB_guess: number[] | null;
  playerA_score: number | null;
  playerB_score: number | null;
  winnerId: string | null;
  loserId: string | null;
  tied: boolean;
  byePair: boolean;
}

export default function GameC9Admin({ gameState, players, onUpdateGameState }: Props) {
  const gsc = (gameState as any).sequenceConfig || {};
  const phase = (gameState as any).phase || gameState.phase;
  const pairsCreated = (gameState as any).sequencePairsCreated || false;
  const byePlayerId = (gameState as any).sequenceByePlayerId || null;
  const tiedPairs: string[] = (gameState as any).sequenceTiedPairs || [];
  const revealStep: number = (gameState as any).sequenceRevealStep || 0;
  const pendingEliminations: string[] = (gameState as any).pendingEliminations || [];

  const [pairs, setPairs] = useState<PairData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tieRule, setTieRule] = useState(gsc.tieRule || "admin_decides");
  const [showOpponentName, setShowOpponentName] = useState(gsc.showOpponentName ?? true);
  const [phaseASeconds, setPhaseASeconds] = useState(gsc.phaseASeconds || 120);
  const [phaseBSeconds, setPhaseBSeconds] = useState(gsc.phaseBSeconds || 90);

  const alivePlayers = players.filter(p => p.status === "alive");

  const phaseA_sealed = pairs.filter(p =>
    p.byePair ? !!p.playerA_sequence : (!!p.playerA_sequence && !!p.playerB_sequence)
  ).length;
  const phaseB_guessed = pairs.filter(p =>
    p.byePair ? true : (!!p.playerA_guess && !!p.playerB_guess)
  ).length;

  const isLobby = phase === "lobby";
  const isPhaseA = phase === "phase_a_open";
  const isPhaseA_locked = phase === "phase_a_locked";
  const isPhaseB = phase === "phase_b_open";
  const isPhaseB_locked = phase === "phase_b_locked";
  const isCalculating = phase === "calculating";
  const isReveal = phase === "reveal";
  const isConfirmed = phase === "confirmed";

  const fetchPairs = async () => {
    try {
      const res = await fetch(`/api/game/sequence/pairs?slotNumber=${gameState.currentSlot}`);
      const data = await res.json();
      if (data.pairs) setPairs(data.pairs);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (pairsCreated) fetchPairs();
  }, [gameState.currentSlot, pairsCreated, phase]);

  const handleCreatePairs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/game/sequence/create-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Pairing failed");
      setPairs(data.pairs);
      onUpdateGameState?.({
        sequencePairsCreated: true,
        sequenceByePlayerId: data.byePlayer?.id || null,
        pendingEliminations: [],
        results: null,
      } as any);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartPhaseA = async () => {
    setLoading(true);
    try {
      const config = {
        phaseASeconds,
        phaseBSeconds,
        showOpponentName,
        exactMatchBonus: 10,
        winnerPoints: 80,
        loserPoints: 0,
        tieRule,
      };
      const res = await fetch("/api/game/sequence/start-phase-a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot, config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdateGameState?.({
        phase: "phase_a_open",
        sequenceConfig: config,
        sequencePhaseAStartedAt: new Date(),
        submissionsCount: 0,
      } as any);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLockPhaseA = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/game/sequence/lock-phase-a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchPairs();
      onUpdateGameState?.({
        phase: "phase_b_open",
        sequencePhaseAStartedAt: null,
        sequencePhaseBStartedAt: new Date(),
      } as any);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLockPhaseB = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/game/sequence/lock-phase-b", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchPairs();
      onUpdateGameState?.({
        phase: "phase_b_locked",
        sequencePhaseBStartedAt: null,
      } as any);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/game/sequence/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot, tieRule }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchPairs();
      onUpdateGameState?.({
        phase: "reveal",
        pendingEliminations: data.eliminatedPlayerIds,
        sequenceTiedPairs: data.tiedPairIds,
        results: {
          eliminatedPlayerIds: data.eliminatedPlayerIds,
          pointsDeltaMap: data.pointsDeltaMap,
          winnerIds: data.winnerIds,
          tiedPairIds: data.tiedPairIds,
        },
      } as any);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevealStep = async (step: number) => {
    await fetch("/api/game/sequence/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step }),
    });
    onUpdateGameState?.({ sequenceRevealStep: step } as any);
  };

  const handleResolveTie = async (pairId: string, resolution: string) => {
    try {
      await fetch("/api/game/sequence/resolve-tie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairId, resolution, slotNumber: gameState.currentSlot }),
      });
      await fetchPairs();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await fetch("/api/game/sequence/confirm-eliminations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotNumber: gameState.currentSlot,
          eliminatedPlayerIds: pendingEliminations,
          pointsDeltaMap: (gameState.results as any)?.pointsDeltaMap || {},
        }),
      });
      onUpdateGameState?.({
        phase: "confirmed",
        pendingEliminations: [],
        sequencePairsCreated: false,
        sequenceByePlayerId: null,
        sequenceTiedPairs: [],
      } as any);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (isConfirmed) {
    return (
      <div className="p-6 text-center space-y-4">
        <h3 className="text-2xl font-serif text-secondary uppercase tracking-widest">Round Complete</h3>
        <p className="text-textMuted font-mono">{pendingEliminations.length} eliminated</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-textDefault">
      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-400 p-4 text-sm">
          Error: {error}
        </div>
      )}

      {isLobby && !pairsCreated && (
        <div className="space-y-4 border border-secondary/50 bg-secondary/10 p-6">
          <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">Sequence Match — Configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-textMuted uppercase block mb-1">Phase A Timer (seconds)</label>
              <input type="number" value={phaseASeconds} onChange={e => setPhaseASeconds(Number(e.target.value))}
                className="w-full bg-background border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-textMuted uppercase block mb-1">Phase B Timer (seconds)</label>
              <input type="number" value={phaseBSeconds} onChange={e => setPhaseBSeconds(Number(e.target.value))}
                className="w-full bg-background border border-border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex items-center justify-between bg-background border border-border p-3">
            <label className="text-xs uppercase">Show Opponent Name in Phase B</label>
            <input type="checkbox" checked={showOpponentName} onChange={e => setShowOpponentName(e.target.checked)} className="w-4 h-4" />
          </div>
          <div>
            <label className="text-[10px] text-textMuted uppercase block mb-1">Tie Rule</label>
            <select value={tieRule} onChange={e => setTieRule(e.target.value)}
              className="w-full bg-background border border-border px-3 py-2 text-sm">
              <option value="admin_decides">Admin decides per pair</option>
              <option value="both_eliminated">Both eliminated</option>
              <option value="both_safe">Both survive</option>
            </select>
          </div>
          <button onClick={handleCreatePairs} disabled={loading || alivePlayers.length < 2}
            className="w-full py-3 bg-secondary/20 text-secondary border border-secondary hover:bg-secondary hover:text-black uppercase tracking-widest disabled:opacity-50">
            {loading ? "Creating pairs..." : `Pair ${alivePlayers.length} Players`}
          </button>
        </div>
      )}

      {pairsCreated && isLobby && (
        <div className="space-y-4 border border-secondary/50 bg-secondary/10 p-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">
              {pairs.length} Pairs Created
              {byePlayerId && <span className="ml-2 text-amber-500">(1 Bye — Auto-advance)</span>}
            </h3>
            <button onClick={handleCreatePairs} className="text-[10px] text-primary uppercase border-b border-primary/50">
              Re-randomize
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {pairs.map(pair => (
              <div key={pair.pairId} className="flex justify-between items-center p-2 bg-background border border-border/50 text-xs">
                <span className={pair.byePair ? "text-amber-500" : ""}>
                  #{pair.pairIndex} {pair.playerAName}
                </span>
                <span className="text-textMuted">vs</span>
                <span className={pair.byePair ? "text-amber-500" : ""}>
                  {pair.byePair ? "BYE" : pair.playerBName}
                </span>
              </div>
            ))}
          </div>
          <button onClick={handleStartPhaseA} disabled={loading}
            className="w-full py-3 bg-primary text-background font-bold uppercase tracking-widest hover:bg-primary/80 disabled:opacity-50">
            {loading ? "Opening..." : "Open Phase A — Secret Sequences"}
          </button>
        </div>
      )}

      {(isPhaseA || isPhaseA_locked) && (
        <div className="space-y-4 border border-primary/50 bg-primary/5 p-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm uppercase tracking-widest text-primary font-bold">Phase A — Secret Sequences</h3>
            <span className="font-mono">{phaseA_sealed} / {alivePlayers.length} sealed</span>
          </div>
          <div className="w-full h-2 bg-background border border-border overflow-hidden">
            <motion.div className="h-full bg-primary" animate={{ width: `${(phaseA_sealed / Math.max(alivePlayers.length, 1)) * 100}%` }} />
          </div>
          {isPhaseA && (
            <button onClick={handleLockPhaseA} disabled={loading}
              className="w-full py-3 bg-primary text-background font-bold uppercase tracking-widest hover:bg-primary/80 disabled:opacity-50">
              {loading ? "Locking..." : "Lock Phase A & Open Phase B"}
            </button>
          )}
          {isPhaseA_locked && (
            <p className="text-center text-textMuted text-xs uppercase">Phase A locked. Transitioning to Phase B...</p>
          )}
        </div>
      )}

      {isPhaseB && (
        <div className="space-y-4 border border-amber-500/50 bg-amber-500/5 p-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm uppercase tracking-widest text-amber-500 font-bold">Phase B — Guess Opponent</h3>
            <span className="font-mono text-amber-500">{phaseB_guessed} / {pairs.filter(p => !p.byePair).length} guessed</span>
          </div>
          <div className="w-full h-2 bg-background border border-border overflow-hidden">
            <motion.div className="h-full bg-amber-500" animate={{ width: `${(phaseB_guessed / Math.max(pairs.filter(p => !p.byePair).length, 1)) * 100}%` }} />
          </div>
          <button onClick={handleLockPhaseB} disabled={loading}
            className="w-full py-3 bg-amber-500 text-black font-bold uppercase tracking-widest hover:bg-amber-400 disabled:opacity-50">
            {loading ? "Locking..." : "Lock Phase B"}
          </button>
        </div>
      )}

      {isPhaseB_locked && !isReveal && (
        <div className="space-y-4 border border-border bg-surface p-6">
          <h3 className="text-sm uppercase tracking-widest text-textMuted">All guesses locked. Ready to calculate.</h3>
          <button onClick={handleCalculate} disabled={loading}
            className="w-full py-3 bg-secondary text-background font-bold uppercase tracking-widest hover:bg-white disabled:opacity-50">
            {loading ? "Calculating..." : "Calculate All Results"}
          </button>
        </div>
      )}

      {isCalculating && (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-textMuted uppercase tracking-widest">Calculating scores...</p>
        </div>
      )}

      {isReveal && (
        <div className="space-y-6 border border-secondary/50 bg-secondary/10 p-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">Results</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(s => (
                <button key={s} onClick={() => handleRevealStep(s)}
                  className={`px-3 py-1 text-xs uppercase ${revealStep >= s ? "bg-secondary text-background" : "border border-border text-textMuted"}`}>
                  Step {s}
                </button>
              ))}
            </div>
          </div>

          {tiedPairs.length > 0 && (
            <div className="border border-amber-500/50 bg-amber-500/5 p-4 space-y-3">
              <h4 className="text-xs uppercase tracking-widest text-amber-500 font-bold">Tied Pairs — Resolve Here</h4>
              {pairs.filter(p => tiedPairs.includes(p.pairId)).map(pair => (
                <div key={pair.pairId} className="flex justify-between items-center p-2 bg-background border border-border/50 text-xs">
                  <span>{pair.playerAName} vs {pair.playerBName} — TIED</span>
                  <div className="flex gap-1">
                    <button onClick={() => handleResolveTie(pair.pairId, "eliminate_a")}
                      className="px-2 py-1 bg-primary/20 text-primary border border-primary text-[10px] uppercase">A Out</button>
                    <button onClick={() => handleResolveTie(pair.pairId, "eliminate_b")}
                      className="px-2 py-1 bg-primary/20 text-primary border border-primary text-[10px] uppercase">B Out</button>
                    <button onClick={() => handleResolveTie(pair.pairId, "both_safe")}
                      className="px-2 py-1 bg-secondary/20 text-secondary border border-secondary text-[10px] uppercase">Both Live</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto space-y-1">
            {pairs.map(pair => {
              const isBye = pair.byePair;
              const winner = pair.winnerId === pair.playerAId ? pair.playerAName :
                pair.winnerId === pair.playerBId ? pair.playerBName : null;
              const isTied = pair.tied;
              return (
                <div key={pair.pairId} className={`flex justify-between items-center p-2 border-b border-border/30 text-xs ${isBye ? "bg-amber-900/10" : ""}`}>
                  <span className={pair.winnerId === pair.playerAId ? "text-green-400" : ""}>
                    {pair.playerAName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">
                      {pair.playerA_score ?? "—"} : {pair.playerB_score ?? "—"}
                    </span>
                    {isTied && <span className="text-amber-500 text-[10px] uppercase">TIED</span>}
                    {!isTied && winner && <span className="text-green-400 text-[10px]">WINNER: {winner}</span>}
                    {isBye && <span className="text-amber-500 text-[10px]">BYE</span>}
                  </div>
                  <span className={pair.winnerId === pair.playerBId ? "text-green-400" : ""}>
                    {isBye ? "Auto-advance" : pair.playerBName}
                  </span>
                </div>
              );
            })}
          </div>

          <button onClick={handleConfirm} disabled={loading || tiedPairs.length > 0}
            className="w-full py-3 bg-primary text-background font-bold uppercase tracking-widest hover:bg-primary/80 disabled:opacity-50">
            {loading ? "Confirming..." : `Confirm ${pendingEliminations.length} Eliminations`}
          </button>
        </div>
      )}
    </div>
  );
}
