import { useState } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { motion } from "framer-motion";
import answersData from "@/lib/data/blackhole_answers.json";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

type PuzzleKey = keyof typeof answersData;

export default function GameB5Admin({ gameState, players, onUpdateGameState }: Props) {
  const gsc = (gameState as any).gameSpecificConfig || {};
  const alivePlayers = players.filter(p => p.status === "alive");
  const isLobby = gameState.phase === "lobby";
  const isActive = gameState.phase === "active";
  const isLocked = gameState.phase === "locked";

  const puzzleKeys = Object.keys(answersData).sort() as PuzzleKey[];
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleKey>((gsc.puzzleKey as PuzzleKey) || puzzleKeys[0]);
  const [maxPoints, setMaxPoints] = useState(gsc.maxPoints ?? 100);
  const [pointDecay, setPointDecay] = useState(gsc.pointDecay ?? 5);
  const [answerVisible, setAnswerVisible] = useState(false);

  const currentPuzzle = answersData[selectedPuzzle];

  const submissions = alivePlayers.filter(p =>
    p.currentSubmission !== null && p.currentSubmission !== undefined
  );

  const handleStartRound = () => {
    if (!onUpdateGameState) return;
    onUpdateGameState({
      phase: "active",
      gameSpecificConfig: {
        ...gsc,
        puzzleKey: selectedPuzzle,
        puzzleImageUrl: `/blackhole/${selectedPuzzle}`,
        correctAnswer: currentPuzzle.top_answer,
        hiddenAnswers: currentPuzzle.hidden_cells_answers,
        allRows: currentPuzzle.all_rows,
        ruleBottomToMiddle: currentPuzzle.rule_bottom_to_middle,
        ruleMiddleToTop: currentPuzzle.rule_middle_to_top,
        maxPoints,
        pointDecay,
      },
    } as any);
  };

  const handleReveal = () => {
    if (!onUpdateGameState) return;

    const correct = currentPuzzle.top_answer;
    const submissionsWithTime = submissions
      .map(p => ({
        playerId: p.id,
        name: p.name,
        answer: (p.currentSubmission as any)?.answer,
        submittedAt: (p.currentSubmission as any)?.submittedAt?.toDate?.() || new Date(),
      }))
      .filter(s => s.answer !== null && s.answer !== undefined);

    const correctOnes = submissionsWithTime
      .filter(s => Number(s.answer) === correct)
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

    const eliminatedPlayerIds: string[] = [];
    const pointsDeltaMap: Record<string, number> = {};
    const rankMap: Record<string, number> = {};

    correctOnes.forEach((s, i) => {
      rankMap[s.playerId] = i + 1;
      const pts = Math.max(0, maxPoints - i * pointDecay);
      pointsDeltaMap[s.playerId] = pts;
    });

    submissionsWithTime.forEach(s => {
      if (rankMap[s.playerId] === undefined) {
        pointsDeltaMap[s.playerId] = 0;
        eliminatedPlayerIds.push(s.playerId);
      }
    });

    onUpdateGameState({
      phase: "reveal",
      results: {
        correctAnswer: correct,
        eliminatedPlayerIds,
        pointsDeltaMap,
        rankMap,
        totalCorrect: correctOnes.length,
        submissions: submissionsWithTime.map(s => ({
          name: s.name,
          answer: s.answer,
          correct: Number(s.answer) === correct,
          rank: rankMap[s.playerId] || null,
          points: pointsDeltaMap[s.playerId] || 0,
        })),
      },
    } as any);
  };

  const correctAnswer = currentPuzzle.top_answer;
  const submittedAnswers = submissions.map(p => ({
    name: p.name,
    answer: (p.currentSubmission as any)?.answer,
    correct: Number((p.currentSubmission as any)?.answer) === correctAnswer,
  }));
  const correctCount = submittedAnswers.filter(a => a.correct).length;

  // Leaderboard preview (sorted by answer for now — real ranking by time on reveal)
  const sorted = [...submittedAnswers].sort((a, b) => {
    if (a.correct !== b.correct) return a.correct ? -1 : 1;
    return 0;
  });

  return (
    <div className="w-full space-y-6 font-mono">
      {isLobby ? (
        <div className="space-y-6 p-4 border border-secondary/40 bg-secondary/5">
          <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">Black Hole — Pyramid Puzzle Setup</h3>

          {/* Puzzle selector */}
          <div className="space-y-3">
            <label className="text-[10px] text-textMuted uppercase tracking-widest block">Select Puzzle</label>
            <div className="grid grid-cols-5 gap-2">
              {puzzleKeys.map((key) => {
                const num = answersData[key].puzzle_number;
                const isSelected = key === selectedPuzzle;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedPuzzle(key)}
                    className={`py-2 px-1 text-xs font-bold border transition-all ${
                      isSelected
                        ? "border-secondary bg-secondary/20 text-secondary"
                        : "border-border text-textMuted hover:border-secondary/50"
                    }`}
                  >
                    #{num}
                  </button>
                );
              })}
            </div>

            {/* Puzzle preview */}
            <div className="border border-border bg-background p-2">
              <img
                src={`/blackhole/${selectedPuzzle}`}
                alt={`Puzzle ${currentPuzzle.puzzle_number}`}
                className="w-full max-h-64 object-contain"
              />
            </div>

            {/* Answer toggle */}
            <div className="flex items-center justify-between bg-background border border-border p-3">
              <div>
                <p className="text-xs uppercase tracking-widest">Correct Answer</p>
                <p className="text-[10px] text-textMuted">Only visible to admin</p>
              </div>
              <button
                onClick={() => setAnswerVisible(v => !v)}
                className={`px-4 py-2 border text-sm font-bold transition-all ${
                  answerVisible
                    ? "border-secondary bg-secondary/20 text-secondary"
                    : "border-border text-textMuted hover:border-secondary/50"
                }`}
              >
                {answerVisible ? `✓ ${correctAnswer}` : "Show Answer"}
              </button>
            </div>

            {answerVisible && (
              <div className="bg-background border border-border p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-textMuted uppercase text-[10px] tracking-widest mb-1">Bottom→Middle</p>
                    <p className="text-secondary font-bold">{currentPuzzle.rule_bottom_to_middle}</p>
                  </div>
                  <div>
                    <p className="text-textMuted uppercase text-[10px] tracking-widest mb-1">Middle→Top</p>
                    <p className="text-secondary font-bold">{currentPuzzle.rule_middle_to_top}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-textMuted uppercase text-[10px] tracking-widest">Full Solution</p>
                  {Object.entries(currentPuzzle.full_solution).map(([key, val]: [string, any]) => (
                    <p key={key} className="text-xs text-textMuted">
                      {key}: <span className="text-white font-bold">{Array.isArray(val) ? val.join(", ") : val}</span>
                    </p>
                  ))}
                </div>
                {Object.keys(currentPuzzle.hidden_cells_answers).length > 0 && (
                  <div className="space-y-1">
                    <p className="text-textMuted uppercase text-[10px] tracking-widest">Hidden Cells</p>
                    {Object.entries(currentPuzzle.hidden_cells_answers).map(([cell, val]) => (
                      <p key={cell} className="text-xs text-amber-400">
                        {cell}: <span className="font-bold">{val}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Points config */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] text-textMuted uppercase tracking-widest block">
                1st Place Points
              </label>
              <input
                type="number"
                value={maxPoints}
                onChange={e => setMaxPoints(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-textMuted uppercase tracking-widest block">
                Points Decay / Rank
              </label>
              <input
                type="number"
                value={pointDecay}
                onChange={e => setPointDecay(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary"
              />
              <p className="text-[10px] text-textMuted">2nd = {maxPoints - pointDecay}, 3rd = {maxPoints - pointDecay * 2}, etc.</p>
            </div>
          </div>

          <button
            onClick={handleStartRound}
            className="w-full py-4 bg-secondary text-background font-bold uppercase tracking-widest hover:bg-white transition-colors"
          >
            START ROUND — SHOW PUZZLE ({alivePlayers.length} players)
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Puzzle being played */}
          {selectedPuzzle && (
            <div className="border border-border bg-background p-2">
              <img
                src={`/blackhole/${selectedPuzzle}`}
                alt="Current puzzle"
                className="w-full max-h-48 object-contain"
              />
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 border border-border bg-surface p-4 text-center text-xs">
            <div>
              <p className="text-[10px] text-textMuted uppercase mb-1">Submitted</p>
              <p className="text-xl font-bold">{submissions.length} / {alivePlayers.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-textMuted uppercase mb-1">Correct</p>
              <p className="text-xl font-bold text-secondary">{correctCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-textMuted uppercase mb-1">Answer</p>
              <p className="text-xl font-bold text-amber-400">{correctAnswer}</p>
            </div>
          </div>

          {/* Live answer feed */}
          <div className="border border-border bg-surface p-4 max-h-64 overflow-y-auto space-y-1">
            <p className="text-[10px] text-textMuted uppercase tracking-widest mb-2">Submissions</p>
            {sorted.length === 0 && (
              <p className="text-textMuted/50 text-xs text-center py-4 italic">No submissions yet.</p>
            )}
            {sorted.map((s, i) => (
              <div key={i} className="flex justify-between items-center p-2 border-b border-border/30 text-xs">
                <span className={s.correct ? "text-secondary" : "text-textMuted"}>
                  {s.name || s.name}
                </span>
                <span className={`font-mono font-bold ${s.correct ? "text-secondary" : "text-primary"}`}>
                  {s.answer ?? "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Reveal */}
          {isLocked && (
            <button
              onClick={handleReveal}
              className="w-full py-3 border border-secondary text-secondary uppercase tracking-widest text-xs font-bold hover:bg-secondary hover:text-background transition-colors shadow-glow-gold"
            >
              REVEAL RESULTS &amp; CALCULATE POINTS
            </button>
          )}
        </div>
      )}
    </div>
  );
}
