import { useState, useCallback } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { motion } from "framer-motion";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

export default function GameSilenceAdmin({ gameState, players, onUpdateGameState }: Props) {
  const gsc = (gameState as any).gameSpecificConfig || {};
  const alivePlayers = players.filter(p => p.status === "alive");
  const isLobby = gameState.phase === "lobby";
  const isLocked = gameState.phase === "locked";

  // Config state
  const [imageUrl, setImageUrl] = useState(gsc.imageUrl || "");
  const [imageDuration, setImageDuration] = useState(gsc.imageDuration ?? 3000);
  const [voteDuration, setVoteDuration] = useState(gsc.voteDuration ?? 6);
  const [options, setOptions] = useState<string[]>(gsc.options || ["A", "B", "C", "D"]);
  const [optionLabels, setOptionLabels] = useState<Record<string, string>>(gsc.optionLabels || { A: "", B: "", C: "", D: "" });
  const [correctAnswer, setCorrectAnswer] = useState(gsc.correctAnswer || "A");
  const [fakeAnswerKey, setFakeAnswerKey] = useState(gsc.fakeAnswerKey || "B");
  const [fakeBias, setFakeBias] = useState(gsc.fakeBias ?? 70);
  const [confidenceTrapEnabled, setConfidenceTrapEnabled] = useState(gsc.confidenceTrapEnabled ?? true);
  const [numOptions, setNumOptions] = useState(options.length);

  const updateNumOptions = (n: number) => {
    const letters = ["A", "B", "C", "D", "E", "F"].slice(0, n);
    setOptions(letters);
    setNumOptions(n);
    const labels: Record<string, string> = {};
    letters.forEach(l => labels[l] = optionLabels[l] || "");
    setOptionLabels(labels);
  };

  // Submissions
  const submissions = alivePlayers.filter(p => p.currentSubmission !== null && p.currentSubmission !== undefined);
  const voteCounts: Record<string, number> = {};
  const confCounts: Record<string, number> = { "100": 0, "70": 0, "50": 0, "null": 0 };
  submissions.forEach(p => {
    const sub = p.currentSubmission as any;
    const ans = sub?.answer || sub;
    if (typeof ans === "string") voteCounts[ans] = (voteCounts[ans] || 0) + 1;
    const conf = sub?.confidence;
    if (conf !== null && conf !== undefined) confCounts[String(conf)] = (confCounts[String(conf)] || 0) + 1;
    else confCounts["null"]++;
  });

  const handleStartGame = () => {
    if (!onUpdateGameState) return;
    if (!imageUrl.trim()) { alert("Please provide an image URL."); return; }
    if (!correctAnswer) { alert("Set the correct answer."); return; }

    // Build fake counts that will be stored for reveal
    const baseFakeCounts: Record<string, number> = {};
    options.forEach(o => baseFakeCounts[o] = o === fakeAnswerKey ? Math.floor((fakeBias / 100) * (gameState.playersAlive || 10)) : Math.floor(((100 - fakeBias) / 100 / (options.length - 1)) * (gameState.playersAlive || 10)));

    onUpdateGameState({
      phase: "active",
      gameSpecificConfig: {
        ...gsc,
        imageUrl,
        imageDuration,
        voteDuration,
        options,
        optionLabels,
        correctAnswer,
        fakeAnswerKey,
        fakeBias,
        confidenceTrapEnabled,
        baseFakeCounts,
      },
    } as any);
  };

  const handleReveal = () => {
    if (!onUpdateGameState) return;

    // Determine who is eliminated
    // Wrong answer → eliminated
    // Wrong + confidence 100% → "instant_elimination" tag (higher penalty)
    const eliminatedPlayerIds: string[] = [];
    const pointsDeltaMap: Record<string, number> = {};

    alivePlayers.forEach(p => {
      const sub = p.currentSubmission as any;
      const ans = sub?.answer || sub;
      const conf = sub?.confidence;
      const isRight = ans === gsc.correctAnswer;
      const isHighConfWrong = !isRight && conf === 100;

      if (!isRight) eliminatedPlayerIds.push(p.id);
      if (isRight) pointsDeltaMap[p.id] = 25;
      else if (isHighConfWrong) pointsDeltaMap[p.id] = -40; // Extra penalty
      else pointsDeltaMap[p.id] = -20;
    });

    onUpdateGameState({
      phase: "reveal",
      results: {
        correctAnswer: gsc.correctAnswer,
        eliminatedPlayerIds,
        pointsDeltaMap,
        voteCounts,
        fakeCounts: gsc.baseFakeCounts || {},
      },
    } as any);
  };

  return (
    <div className="w-full space-y-6 font-mono">
      {isLobby ? (
        <div className="space-y-6 p-4 border border-secondary/40 bg-secondary/5">
          <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">Pluralistic Silence — Fake Majority Setup</h3>

          {/* Image URL */}
          <div className="space-y-2">
            <label className="text-[10px] text-textMuted uppercase tracking-widest block">Image URL (shown for {imageDuration / 1000}s then disappears)</label>
            <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg"
              className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary" />
            {imageUrl && (
              <div className="mt-2 border border-border bg-background p-2 max-h-32 overflow-hidden">
                <img src={imageUrl} alt="Preview" className="max-h-28 object-contain mx-auto" onError={e => (e.currentTarget.style.display = "none")} />
              </div>
            )}
          </div>

          {/* Timings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] text-textMuted uppercase">Image Visible Duration</label>
              <select value={imageDuration} onChange={e => setImageDuration(+e.target.value)}
                className="w-full bg-background border border-border px-2 py-2 text-sm outline-none focus:border-secondary">
                <option value={1500}>1.5 seconds (hardest)</option>
                <option value={2000}>2 seconds</option>
                <option value={3000}>3 seconds (default)</option>
                <option value={4000}>4 seconds (easier)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-textMuted uppercase">Vote Countdown (seconds)</label>
              <input type="number" min="4" max="15" value={voteDuration} onChange={e => setVoteDuration(+e.target.value)}
                className="w-full bg-background border border-border px-2 py-2 text-sm outline-none focus:border-secondary" />
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-textMuted uppercase tracking-widest">Answer Options</label>
              <div className="flex gap-2">
                {[2, 3, 4].map(n => (
                  <button key={n} onClick={() => updateNumOptions(n)}
                    className={`px-3 py-1 border text-xs uppercase ${numOptions === n ? "border-secondary text-secondary" : "border-border text-textMuted hover:border-secondary/50"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {options.map(opt => (
              <div key={opt} className="flex gap-2 items-center">
                <span className="w-8 text-secondary font-bold text-sm">{opt}</span>
                <input type="text" value={optionLabels[opt] || ""} onChange={e => setOptionLabels(prev => ({ ...prev, [opt]: e.target.value }))}
                  placeholder={`Label for ${opt} (optional)`}
                  className="flex-1 bg-background border border-border px-2 py-1.5 text-xs outline-none focus:border-secondary" />
              </div>
            ))}
          </div>

          {/* Correct answer + Fake majority setup */}
          <div className="grid grid-cols-2 gap-4 p-4 border border-border bg-background">
            <div className="space-y-1">
              <label className="text-[10px] text-textMuted uppercase">Correct Answer</label>
              <select value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
                className="w-full bg-surface border border-border px-2 py-2 text-sm outline-none focus:border-green-500">
                {options.map(o => <option key={o} value={o}>{o}{optionLabels[o] ? ` — ${optionLabels[o]}` : ""}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-textMuted uppercase">Fake Majority pushes... (wrong answer)</label>
              <select value={fakeAnswerKey} onChange={e => setFakeAnswerKey(e.target.value)}
                className="w-full bg-surface border border-border px-2 py-2 text-sm outline-none focus:border-amber-500">
                {options.map(o => <option key={o} value={o}>{o}{optionLabels[o] ? ` — ${optionLabels[o]}` : ""}</option>)}
              </select>
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] text-textMuted uppercase">Fake Majority Bias ({fakeBias}% shown for {fakeAnswerKey})</label>
              <input type="range" min="50" max="90" value={fakeBias} onChange={e => setFakeBias(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-[10px] text-amber-400">Fake counter will show ~{fakeBias}% chose {fakeAnswerKey} — even if that's wrong.</p>
            </div>
          </div>

          {/* Confidence trap toggle */}
          <div className="flex items-center justify-between bg-background border border-border p-4">
            <div>
              <label className="text-xs uppercase tracking-widest block">Confidence Trap</label>
              <p className="text-[10px] text-textMuted mt-0.5">Wrong + 100% confident = instant elimination (-40pts)</p>
            </div>
            <input type="checkbox" checked={confidenceTrapEnabled} onChange={e => setConfidenceTrapEnabled(e.target.checked)} className="w-5 h-5 accent-primary" />
          </div>

          <button onClick={handleStartGame}
            className="w-full py-4 border border-primary bg-primary/10 text-primary uppercase tracking-widest font-bold text-sm hover:bg-primary hover:text-white transition-colors shadow-glow-red">
            FLASH IMAGE &amp; START ROUND
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Live stats */}
          <div className="grid grid-cols-3 gap-4 border border-border bg-surface p-4 text-center text-xs">
            <div>
              <p className="text-[10px] text-textMuted uppercase mb-1">Voted</p>
              <p className="text-xl">{submissions.length} / {alivePlayers.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-textMuted uppercase mb-1">Correct Ans</p>
              <p className="text-xl font-bold text-secondary">{gsc.correctAnswer}</p>
            </div>
            <div>
              <p className="text-[10px] text-textMuted uppercase mb-1">Fake pushes</p>
              <p className="text-xl text-amber-400">{gsc.fakeAnswerKey} ({gsc.fakeBias}%)</p>
            </div>
          </div>

          {/* Live vote distribution */}
          <div className="border border-border bg-surface p-4 space-y-2">
            <p className="text-[10px] text-textMuted uppercase tracking-widest">Real Votes</p>
            {(gsc.options || []).map((opt: string) => {
              const count = voteCounts[opt] || 0;
              const pct = alivePlayers.length > 0 ? (count / alivePlayers.length) * 100 : 0;
              const isCorrect = opt === gsc.correctAnswer;
              return (
                <div key={opt} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={`uppercase ${isCorrect ? "text-secondary font-bold" : "text-textMuted"}`}>{opt} {isCorrect ? "✓" : ""}</span>
                    <span>{count}</span>
                  </div>
                  <div className="w-full bg-background h-3 overflow-hidden">
                    <motion.div className={`h-full ${isCorrect ? "bg-secondary" : "bg-primary/60"}`} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Confidence breakdown */}
          {confidenceTrapEnabled && submissions.length > 0 && (
            <div className="border border-border bg-surface p-4">
              <p className="text-[10px] text-textMuted uppercase tracking-widest mb-3">Confidence Distribution</p>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {[["100", "text-primary"], ["70", "text-secondary"], ["50", "text-textMuted"], ["null", "text-textMuted/50"]].map(([k, cls]) => (
                  <div key={k}>
                    <p className={`font-bold ${cls}`}>{confCounts[k] || 0}</p>
                    <p className="text-textMuted text-[10px]">{k === "null" ? "no conf" : `${k}%`}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-primary mt-2">
                ⚠ {submissions.filter(p => { const s = p.currentSubmission as any; return (s?.answer || s) !== gsc.correctAnswer && s?.confidence === 100; }).length} players are Wrong + 100% confident
              </p>
            </div>
          )}

          {isLocked && (
            <button onClick={handleReveal}
              className="w-full py-3 border border-secondary text-secondary uppercase tracking-widest text-xs hover:bg-secondary hover:text-background transition-colors shadow-glow-gold">
              REVEAL TRUTH &amp; ELIMINATE
            </button>
          )}
        </div>
      )}
    </div>
  );
}
