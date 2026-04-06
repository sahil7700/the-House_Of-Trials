import { useState, useEffect } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { motion } from "framer-motion";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

export default function GameB8Admin({ gameState, players, onUpdateGameState }: Props) {
  const b8Config: any = (gameState as any).b8Config || {};
  const b8Results: any = (gameState as any).b8Results || null;
  const phase = (gameState as any).phase || gameState.phase;
  const b8RevealStep: number = (gameState as any).b8RevealStep || 0;
  const pendingEliminations: string[] = (gameState as any).pendingEliminations || [];
  const votingStartedAt: any = (gameState as any).votingStartedAt;
  const confidenceStartedAt: any = (gameState as any).confidenceStartedAt;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [correctAnswer, setCorrectAnswer] = useState(b8Config.correctAnswer || "A");
  const [optionALabel, setOptionALabel] = useState(b8Config.optionALabel || "Option A");
  const [optionBLabel, setOptionBLabel] = useState(b8Config.optionBLabel || "Option B");
  const [imageFlashSeconds, setImageFlashSeconds] = useState(b8Config.imageFlashSeconds || 3);
  const [votingSeconds, setVotingSeconds] = useState(b8Config.votingSeconds || 7);
  const [confidenceEnabled, setConfidenceEnabled] = useState(b8Config.confidenceEnabled ?? true);
  const [confidenceSeconds, setConfidenceSeconds] = useState(b8Config.confidenceSeconds || 5);
  const [fakeMajorityEnabled, setFakeMajorityEnabled] = useState(b8Config.fakeMajorityEnabled ?? true);
  const [fakeMajorityBiasToward, setFakeMajorityBiasToward] = useState(b8Config.fakeMajorityBiasToward || "A");
  const [fakeMajorityStartPercent, setFakeMajorityStartPercent] = useState(b8Config.fakeMajorityStartPercent || 72);

  const alivePlayers = players.filter(p => p.status === "alive");
  const votedCount = players.filter(p => p.currentSubmission !== null && p.currentSubmission !== undefined && p.status === "alive").length;
  const votesA = players.filter(p => p.currentSubmission === "A" && p.status === "alive").length;
  const votesB = players.filter(p => p.currentSubmission === "B" && p.status === "alive").length;
  const notVoted = alivePlayers.length - votedCount;

  const isLobby = phase === "lobby";
  const isImageFlash = phase === "image_flash";
  const isVotingOpen = phase === "voting_open";
  const isVotingLocked = phase === "voting_locked";
  const isConfidence = phase === "confidence";
  const isConfidenceLocked = phase === "confidence_locked";
  const isReveal = phase === "reveal";
  const isConfirmed = phase === "confirmed";

  const [votingRemaining, setVotingRemaining] = useState<number | null>(null);
  const [flashRemaining, setFlashRemaining] = useState<number | null>(null);
  const [confidenceRemaining, setConfidenceRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!isVotingOpen || !votingStartedAt) return;
    const update = () => {
      const start = votingStartedAt?.toDate?.()?.getTime() || Date.now();
      const remaining = Math.max(0, votingSeconds - Math.floor((Date.now() - start) / 1000));
      setVotingRemaining(remaining);
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [isVotingOpen, votingStartedAt, votingSeconds]);

  useEffect(() => {
    if (!isImageFlash) return;
    const update = () => {
      const start = (gameState as any).imageFlashStartedAt?.toDate?.()?.getTime() || Date.now();
      const remaining = Math.max(0, imageFlashSeconds - Math.floor((Date.now() - start) / 1000));
      setFlashRemaining(remaining);
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [isImageFlash, imageFlashSeconds, gameState]);

  useEffect(() => {
    if (!isConfidence || !confidenceStartedAt) return;
    const update = () => {
      const start = confidenceStartedAt?.toDate?.()?.getTime() || Date.now();
      const remaining = Math.max(0, confidenceSeconds - Math.floor((Date.now() - start) / 1000));
      setConfidenceRemaining(remaining);
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [isConfidence, confidenceStartedAt, confidenceSeconds]);

  const getConfig = () => ({
    correctAnswer,
    optionALabel,
    optionBLabel,
    imageFlashSeconds,
    votingSeconds,
    confidenceEnabled,
    confidenceSeconds,
    fakeMajorityEnabled,
    fakeMajorityBiasToward,
    fakeMajorityStartPercent,
  });

  const handleStartFlash = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/game/b8/start-flash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot, config: getConfig() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdateGameState?.({
        phase: "image_flash",
        b8Config: getConfig(),
        imageFlashStartedAt: new Date(),
      } as any);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleOpenVoting = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/game/b8/open-voting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdateGameState?.({
        phase: "voting_open",
        votingStartedAt: new Date(),
      } as any);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleLockVotes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/game/b8/lock-votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot, confidenceEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdateGameState?.({
        phase: data.phase,
        ...(data.phase === "confidence" ? { confidenceStartedAt: new Date() } : {}),
      } as any);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleLockConfidence = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/game/b8/lock-confidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdateGameState?.({ phase: "confidence_locked" } as any);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/game/b8/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot, gameState }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdateGameState?.({
        phase: "reveal",
        b8RevealStep: 0,
        b8Results: {
          totalVoters: data.votesA + data.votesB,
          votesA: data.votesA,
          votesB: data.votesB,
          correctAnswer: data.correctAnswer,
          eliminatedCount: data.eliminatedCount,
          overconfidentCount: data.overconfidentCount,
        },
        pendingEliminations: data.eliminatedPlayerIds,
      } as any);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleRevealStep = async (step: number) => {
    await fetch("/api/game/b8/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step }),
    });
    onUpdateGameState?.({ b8RevealStep: step } as any);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await fetch("/api/game/b8/confirm-eliminations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: gameState.currentSlot, eliminatedPlayerIds: pendingEliminations }),
      });
      onUpdateGameState?.({
        phase: "confirmed",
        pendingEliminations: [],
        b8Config: null,
        b8Results: null,
        b8RevealStep: 0,
      } as any);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
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

      {isLobby && (
        <div className="space-y-4 border border-secondary/50 bg-secondary/10 p-6">
          <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">Information Cascade — Configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-textMuted uppercase block mb-1">Correct Answer</label>
              <div className="flex gap-2">
                <button onClick={() => setCorrectAnswer("A")}
                  className={`flex-1 py-2 border text-xs uppercase ${correctAnswer === "A" ? "bg-secondary text-background border-secondary" : "border-border hover:border-secondary"}`}>A</button>
                <button onClick={() => setCorrectAnswer("B")}
                  className={`flex-1 py-2 border text-xs uppercase ${correctAnswer === "B" ? "bg-secondary text-background border-secondary" : "border-border hover:border-secondary"}`}>B</button>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-textMuted uppercase block mb-1">Image Flash (sec)</label>
              <input type="number" min="1" max="10" value={imageFlashSeconds}
                onChange={e => setImageFlashSeconds(Number(e.target.value))}
                className="w-full bg-background border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-textMuted uppercase block mb-1">Voting Window (sec)</label>
              <input type="number" min="3" max="20" value={votingSeconds}
                onChange={e => setVotingSeconds(Number(e.target.value))}
                className="w-full bg-background border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-textMuted uppercase block mb-1">Option A Label</label>
              <input type="text" value={optionALabel}
                onChange={e => setOptionALabel(e.target.value)}
                className="w-full bg-background border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-textMuted uppercase block mb-1">Option B Label</label>
              <input type="text" value={optionBLabel}
                onChange={e => setOptionBLabel(e.target.value)}
                className="w-full bg-background border border-border px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between bg-background border border-border p-3">
              <label className="text-xs uppercase">Enable Fake Majority Counter</label>
              <input type="checkbox" checked={fakeMajorityEnabled} onChange={e => setFakeMajorityEnabled(e.target.checked)} className="w-4 h-4" />
            </div>
            {fakeMajorityEnabled && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-background border border-border">
                <div>
                  <label className="text-[10px] text-textMuted uppercase block mb-1">Bias Toward</label>
                  <div className="flex gap-1">
                    <button onClick={() => setFakeMajorityBiasToward("A")}
                      className={`flex-1 py-1 border text-xs ${fakeMajorityBiasToward === "A" ? "bg-primary text-white border-primary" : "border-border"}`}>A</button>
                    <button onClick={() => setFakeMajorityBiasToward("B")}
                      className={`flex-1 py-1 border text-xs ${fakeMajorityBiasToward === "B" ? "bg-blue-500 text-white border-blue-500" : "border-border"}`}>B</button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-textMuted uppercase block mb-1">Start % for biased</label>
                  <input type="number" min="55" max="90" value={fakeMajorityStartPercent}
                    onChange={e => setFakeMajorityStartPercent(Number(e.target.value))}
                    className="w-full bg-surface border border-border px-2 py-1 text-sm" />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between bg-background border border-border p-3">
              <label className="text-xs uppercase">Enable Confidence Trap</label>
              <input type="checkbox" checked={confidenceEnabled} onChange={e => setConfidenceEnabled(e.target.checked)} className="w-4 h-4" />
            </div>
            {confidenceEnabled && (
              <div className="p-3 bg-background border border-border">
                <label className="text-[10px] text-textMuted uppercase block mb-1">Confidence Window (sec)</label>
                <input type="number" min="3" max="10" value={confidenceSeconds}
                  onChange={e => setConfidenceSeconds(Number(e.target.value))}
                  className="w-full bg-surface border border-border px-3 py-2 text-sm" />
              </div>
            )}
          </div>

          <button onClick={handleStartFlash} disabled={loading}
            className="w-full py-3 bg-secondary text-background font-bold uppercase tracking-widest hover:bg-white disabled:opacity-50">
            {loading ? "Starting..." : `Start Image Flash (${alivePlayers.length} players)`}
          </button>
        </div>
      )}

      {isImageFlash && (
        <div className="space-y-4 border border-secondary/50 bg-secondary/10 p-6">
          <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">Image Flash in Progress</h3>
          <div className="text-center">
            <p className="text-6xl font-mono text-secondary">{flashRemaining ?? imageFlashSeconds}s</p>
            <p className="text-textMuted text-xs uppercase mt-2">Image visible to all players</p>
          </div>
          <button onClick={handleOpenVoting} disabled={loading}
            className="w-full py-3 bg-primary text-white font-bold uppercase tracking-widest hover:bg-primary/80 disabled:opacity-50">
            {loading ? "Opening..." : "Open Voting"}
          </button>
        </div>
      )}

      {isVotingOpen && (
        <div className="space-y-4 border border-primary/50 bg-primary/5 p-6">
          <h3 className="text-sm uppercase tracking-widest text-primary font-bold">Voting Open</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-background border border-border p-3">
              <p className="text-3xl font-mono text-primary">{votesA}</p>
              <p className="text-[10px] text-textMuted uppercase">Voted A</p>
            </div>
            <div className="bg-background border border-border p-3">
              <p className="text-3xl font-mono text-white">{votingRemaining ?? votingSeconds}s</p>
              <p className="text-[10px] text-textMuted uppercase">Remaining</p>
            </div>
            <div className="bg-background border border-border p-3">
              <p className="text-3xl font-mono text-blue-400">{votesB}</p>
              <p className="text-[10px] text-textMuted uppercase">Voted B</p>
            </div>
          </div>
          <div className="flex h-6 w-full overflow-hidden border border-border">
            {alivePlayers.length > 0 && (
              <>
                <motion.div className="h-full bg-primary" animate={{ width: `${(votesA / alivePlayers.length) * 100}%` }} />
                <motion.div className="h-full bg-blue-500" animate={{ width: `${(votesB / alivePlayers.length) * 100}%` }} />
              </>
            )}
          </div>
          {notVoted > 0 && (
            <p className="text-center text-xs text-amber-500">{notVoted} players have not voted</p>
          )}
          <button onClick={handleLockVotes} disabled={loading}
            className="w-full py-3 bg-primary text-white font-bold uppercase tracking-widest hover:bg-primary/80 disabled:opacity-50">
            {loading ? "Locking..." : "Lock Votes"}
          </button>
        </div>
      )}

      {(isConfidence || isConfidenceLocked) && (
        <div className="space-y-4 border border-amber-500/50 bg-amber-500/5 p-6">
          <h3 className="text-sm uppercase tracking-widest text-amber-500 font-bold">Confidence Ratings</h3>
          {confidenceRemaining !== null && (
            <div className="text-center">
              <p className="text-4xl font-mono text-amber-500">{confidenceRemaining}s</p>
              <p className="text-[10px] text-textMuted uppercase">Confidence window remaining</p>
            </div>
          )}
          {isConfidence && (
            <button onClick={handleLockConfidence} disabled={loading}
              className="w-full py-3 bg-amber-500 text-black font-bold uppercase tracking-widest hover:bg-amber-400 disabled:opacity-50">
              {loading ? "Locking..." : "Lock Confidence"}
            </button>
          )}
        </div>
      )}

      {(isVotingLocked || isConfidenceLocked) && !isReveal && (
        <div className="space-y-4 border border-border bg-surface p-6">
          <h3 className="text-sm uppercase tracking-widest text-textMuted">Ready to calculate results</h3>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-background border border-border p-3">
              <p className="text-2xl font-mono text-primary">{votesA}</p>
              <p className="text-[10px] text-textMuted uppercase">Voted A</p>
            </div>
            <div className="bg-background border border-border p-3">
              <p className="text-2xl font-mono text-blue-400">{votesB}</p>
              <p className="text-[10px] text-textMuted uppercase">Voted B</p>
            </div>
          </div>
          <div className="text-center p-4 bg-background border border-border">
            <p className="text-xs text-textMuted uppercase mb-2">Correct Answer</p>
            <p className="text-4xl font-mono text-secondary">{correctAnswer}</p>
          </div>
          <button onClick={handleCalculate} disabled={loading}
            className="w-full py-3 bg-secondary text-background font-bold uppercase tracking-widest hover:bg-white disabled:opacity-50">
            {loading ? "Calculating..." : "Calculate & Show Results"}
          </button>
        </div>
      )}

      {isReveal && b8Results && (
        <div className="space-y-4 border border-secondary/50 bg-secondary/10 p-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">Reveal</h3>
            <div className="flex gap-2">
              {[1, 2, 3].map(s => (
                <button key={s} onClick={() => handleRevealStep(s)}
                  className={`px-3 py-1 text-xs uppercase ${b8RevealStep >= s ? "bg-secondary text-background" : "border border-border text-textMuted"}`}>
                  Step {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-background border border-primary/50 p-4">
              <p className="text-3xl font-mono text-primary">{b8Results.votesA}</p>
              <p className="text-[10px] text-textMuted uppercase">Voted A</p>
            </div>
            <div className="bg-background border border-secondary/50 p-4">
              <p className="text-3xl font-mono text-secondary">{b8Results.correctAnswer}</p>
              <p className="text-[10px] text-textMuted uppercase">Correct</p>
            </div>
            <div className="bg-background border border-blue-500/50 p-4">
              <p className="text-3xl font-mono text-blue-400">{b8Results.votesB}</p>
              <p className="text-[10px] text-textMuted uppercase">Voted B</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-primary/10 border border-primary/50 p-3">
              <p className="text-2xl font-mono text-primary">{b8Results.eliminatedCount}</p>
              <p className="text-[10px] text-textMuted uppercase">Eliminated</p>
            </div>
            <div className="bg-amber-900/10 border border-amber-500/50 p-3">
              <p className="text-2xl font-mono text-amber-500">{b8Results.overconfidentCount}</p>
              <p className="text-[10px] text-textMuted uppercase">Overconfident</p>
            </div>
          </div>

          <button onClick={handleConfirm} disabled={loading}
            className="w-full py-3 bg-primary text-white font-bold uppercase tracking-widest hover:bg-primary/80 disabled:opacity-50">
            {loading ? "Confirming..." : `Confirm ${pendingEliminations.length} Eliminations`}
          </button>
        </div>
      )}
    </div>
  );
}
