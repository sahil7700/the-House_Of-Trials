import { useState, useEffect } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { motion } from "framer-motion";
import questionsData from "@/lib/data/fake_majority_questions.json";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

type Question = typeof questionsData.questions[number];

export default function GameSilenceAdmin({ gameState, players, onUpdateGameState }: Props) {
  const gsc = (gameState as any).gameSpecificConfig || {};
  const alivePlayers = players.filter(p => p.status === "alive");
  const isLobby = gameState.phase === "lobby";
  const isLocked = gameState.phase === "locked";

  const [imageUrl, setImageUrl] = useState(gsc.imageUrl || "");
  const [imageDuration, setImageDuration] = useState(gsc.imageDuration ?? 3000);
  const [voteDuration, setVoteDuration] = useState(gsc.voteDuration ?? 6);
  const [options, setOptions] = useState<string[]>(gsc.options || ["A", "B"]);
  const [optionLabels, setOptionLabels] = useState<Record<string, string>>(gsc.optionLabels || { A: "", B: "" });
  const [questionText, setQuestionText] = useState(gsc.questionText || "");
  const [correctAnswer, setCorrectAnswer] = useState(gsc.correctAnswer || "A");
  const [fakeAnswerKey, setFakeAnswerKey] = useState(gsc.fakeAnswerKey || "B");
  const [fakeBias, setFakeBias] = useState(gsc.fakeBias ?? 70);
  const [confidenceTrapEnabled, setConfidenceTrapEnabled] = useState(gsc.confidenceTrapEnabled ?? true);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(gsc.selectedQuestionId || "");

  const applyQuestion = (q: Question) => {
    setSelectedQuestionId(q.id);
    setImageUrl(`/fake_majority/images/${q.imageFile}`);
    setImageDuration((q.suggestedVisionSeconds ?? 3) * 1000);
    setVoteDuration(q.suggestedVotingSeconds ?? 6);
    setQuestionText(q.question);
    setCorrectAnswer(q.correctAnswer);

    let opts: string[] = ["A", "B"];
    let labels: Record<string, string> = {};

    if ((q as any).optionC) {
      opts = ["A", "B", "C"];
      labels = { A: q.optionA, B: q.optionB, C: (q as any).optionC };
    } else {
      labels = { A: q.optionA, B: q.optionB };
    }

    setOptions(opts);
    setOptionLabels(labels);

    const fake = q.fakeMajorityBiasToward || "B";
    setFakeAnswerKey(fake);
    setFakeBias(q.fakeMajorityStartPercent ?? 70);
  };

  const handleReset = () => {
    setImageUrl("");
    setImageDuration(3000);
    setVoteDuration(6);
    setQuestionText("");
    setCorrectAnswer("A");
    setFakeAnswerKey("B");
    setFakeBias(70);
    setOptions(["A", "B"]);
    setOptionLabels({ A: "", B: "" });
    setSelectedQuestionId("");
  };

  const handleStartGame = () => {
    if (!onUpdateGameState) return;
    if (!imageUrl.trim()) { alert("Please provide an image URL or pick a question."); return; }
    if (!correctAnswer) { alert("Set the correct answer."); return; }

    const baseFakeCounts: Record<string, number> = {};
    options.forEach(o => {
      baseFakeCounts[o] = o === fakeAnswerKey
        ? Math.floor((fakeBias / 100) * (gameState.playersAlive || 10))
        : Math.floor(((100 - fakeBias) / 100 / (options.length - 1)) * (gameState.playersAlive || 10));
    });

    onUpdateGameState({
      phase: "active",
      gameSpecificConfig: {
        ...gsc,
        selectedQuestionId,
        imageUrl,
        imageDuration,
        voteDuration,
        options,
        optionLabels,
        questionText,
        correctAnswer,
        fakeAnswerKey,
        fakeBias,
        confidenceTrapEnabled,
        baseFakeCounts,
      },
    } as any);
  };

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

  const handleReveal = () => {
    if (!onUpdateGameState) return;
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
      else if (isHighConfWrong) pointsDeltaMap[p.id] = -40;
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

          {/* Question picker */}
          <div className="space-y-2">
            <label className="text-[10px] text-textMuted uppercase tracking-widest block">
              Pick a Question
            </label>
            <div className="flex gap-2">
              <select
                value={selectedQuestionId}
                onChange={e => {
                  if (!e.target.value) { handleReset(); return; }
                  const q = questionsData.questions.find(q => q.id === e.target.value);
                  if (q) applyQuestion(q);
                }}
                className="flex-1 bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary"
              >
                <option value="">— Pick a question —</option>
                {questionsData.questions.map(q => (
                  <option key={q.id} value={q.id}>
                    [{q.id}] {q.question.substring(0, 60)}{q.question.length > 60 ? "…" : ""}
                  </option>
                ))}
              </select>
              {selectedQuestionId && (
                <button
                  onClick={handleReset}
                  className="px-3 py-2 border border-border text-textMuted text-xs hover:border-primary hover:text-primary transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Difficulty badge */}
            {selectedQuestionId && (
              <div className="flex gap-2 text-[10px]">
                {(() => {
                  const q = questionsData.questions.find(q => q.id === selectedQuestionId);
                  if (!q) return null;
                  return (
                    <>
                      <span className={`px-2 py-0.5 border ${q.difficulty === "easy" ? "border-green-500/50 text-green-400" : q.difficulty === "hard" ? "border-primary/50 text-primary" : "border-amber-500/50 text-amber-400"}`}>
                        {q.difficulty.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 border border-border text-textMuted">{q.category.replace("_", " ")}</span>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Question text preview */}
          {questionText && (
            <div className="bg-background border border-secondary/30 p-3 text-xs text-secondary italic">
              &ldquo;{questionText}&rdquo;
            </div>
          )}

          {/* Image preview */}
          {imageUrl && (
            <div className="space-y-1">
              <label className="text-[10px] text-textMuted uppercase tracking-widest block">Image Preview</label>
              <div className="border border-border bg-background p-2 max-h-48 overflow-hidden">
                <img src={imageUrl} alt="Preview" className="max-h-44 object-contain mx-auto" onError={e => (e.currentTarget.style.display = "none")} />
              </div>
            </div>
          )}

          {/* Timings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] text-textMuted uppercase">Image Visible (seconds)</label>
              <select value={imageDuration} onChange={e => setImageDuration(+e.target.value)}
                className="w-full bg-background border border-border px-2 py-2 text-sm outline-none focus:border-secondary">
                <option value={1500}>1.5s (hardest)</option>
                <option value={2000}>2s</option>
                <option value={3000}>3s (default)</option>
                <option value={4000}>4s</option>
                <option value={5000}>5s</option>
                <option value={6000}>6s</option>
                <option value={8000}>8s</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-textMuted uppercase">Vote Countdown (seconds)</label>
              <input type="number" min="4" max="20" value={voteDuration} onChange={e => setVoteDuration(+e.target.value)}
                className="w-full bg-background border border-border px-2 py-2 text-sm outline-none focus:border-secondary" />
            </div>
          </div>

          {/* Answer options */}
          <div className="space-y-2">
            <label className="text-[10px] text-textMuted uppercase tracking-widest">Answer Options</label>
            <div className="bg-background border border-border p-3 space-y-2">
              {options.map(opt => (
                <div key={opt} className="flex gap-2 items-center">
                  <span className="w-6 text-secondary font-bold text-sm text-center">{opt}</span>
                  <input
                    type="text"
                    value={optionLabels[opt] || ""}
                    onChange={e => setOptionLabels(prev => ({ ...prev, [opt]: e.target.value }))}
                    placeholder={`Label for ${opt}`}
                    className="flex-1 bg-surface border border-border px-2 py-1.5 text-xs outline-none focus:border-secondary"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Correct answer + fake majority */}
          <div className="grid grid-cols-2 gap-4 p-4 border border-border bg-background">
            <div className="space-y-1">
              <label className="text-[10px] text-textMuted uppercase">Correct Answer</label>
              <select value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
                className="w-full bg-surface border border-border px-2 py-2 text-sm outline-none focus:border-green-500">
                {options.map(o => <option key={o} value={o}>{o} — {optionLabels[o] || o}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-textMuted uppercase">Fake Majority Pushes (wrong)</label>
              <select value={fakeAnswerKey} onChange={e => setFakeAnswerKey(e.target.value)}
                className="w-full bg-surface border border-border px-2 py-2 text-sm outline-none focus:border-amber-500">
                {options.filter(o => o !== correctAnswer).map(o => (
                  <option key={o} value={o}>{o} — {optionLabels[o] || o}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] text-textMuted uppercase">
                Fake Bias ({fakeBias}% push toward {fakeAnswerKey})
              </label>
              <input type="range" min="50" max="95" value={fakeBias} onChange={e => setFakeBias(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-[10px] text-amber-400">
                ~{fakeBias}% of fake votes will show {fakeAnswerKey} — even if it&apos;s wrong.
              </p>
            </div>
          </div>

          {/* Confidence trap */}
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
              <p className="text-[10px] text-textMuted uppercase mb-1">Correct</p>
              <p className="text-xl font-bold text-secondary">{gsc.correctAnswer}</p>
            </div>
            <div>
              <p className="text-[10px] text-textMuted uppercase mb-1">Fake Push</p>
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
                    <span className={`uppercase ${isCorrect ? "text-secondary font-bold" : "text-textMuted"}`}>
                      {opt} {isCorrect ? "✓" : ""} — {gsc.optionLabels?.[opt] || opt}
                    </span>
                    <span>{count}</span>
                  </div>
                  <div className="w-full bg-background h-3 overflow-hidden">
                    <motion.div
                      className={`h-full ${isCorrect ? "bg-secondary" : "bg-primary/60"}`}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5 }}
                    />
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
                {([["100", "text-primary"], ["70", "text-secondary"], ["50", "text-textMuted"], ["null", "text-textMuted/50"]] as const).map(([k, cls]) => (
                  <div key={k}>
                    <p className={`font-bold ${cls}`}>{confCounts[k] || 0}</p>
                    <p className="text-textMuted text-[10px]">{k === "null" ? "no conf" : `${k}%`}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-primary mt-2">
                ⚠ {submissions.filter(p => {
                  const s = p.currentSubmission as any;
                  return (s?.answer || s) !== gsc.correctAnswer && s?.confidence === 100;
                }).length} players are Wrong + 100% confident
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
