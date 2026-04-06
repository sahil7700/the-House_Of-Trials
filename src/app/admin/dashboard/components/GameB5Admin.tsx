import { useState } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  const isReveal = gameState.phase === "reveal";

  const puzzleKeys = Object.keys(answersData).sort() as PuzzleKey[];
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleKey>((gsc.puzzleKey as PuzzleKey) || puzzleKeys[0]);
  const [maxPoints, setMaxPoints] = useState(gsc.maxPoints ?? 100);
  const [pointDecay, setPointDecay] = useState(gsc.pointDecay ?? 5);
  const [answerVisible, setAnswerVisible] = useState(false);

  const [correctPlayerIds, setCorrectPlayerIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const currentPuzzle = answersData[selectedPuzzle];
  const correctAnswer = currentPuzzle.top_answer;

  const toggleCorrect = (playerId: string) => {
    setCorrectPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const handleStartRound = () => {
    if (!onUpdateGameState) return;
    setCorrectPlayerIds(new Set());
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

  const handleReveal = async () => {
    if (!onUpdateGameState) return;
    setSaving(true);

    const correctIds = Array.from(correctPlayerIds);
    const wrongIds = alivePlayers
      .map(p => p.id)
      .filter(id => !correctPlayerIds.has(id));

    const pointsDeltaMap: Record<string, number> = {};
    const rankMap: Record<string, number> = {};

    correctIds.forEach((id, i) => {
      rankMap[id] = i + 1;
      pointsDeltaMap[id] = Math.max(0, maxPoints - i * pointDecay);
    });
    wrongIds.forEach(id => {
      pointsDeltaMap[id] = 0;
    });

    const batch = writeBatch(db);
    [...correctIds, ...wrongIds].forEach(playerId => {
      const pts = pointsDeltaMap[playerId];
      const isCorrect = correctPlayerIds.has(playerId);
      batch.update(doc(db, "players", playerId), {
        currentSubmission: { adminMarkedCorrect: isCorrect, answer: null },
        points: (players.find(p => p.id === playerId)?.points || 0) + pts,
      });
    });
    batch.update(doc(db, "system", "gameState"), { results: null });
    await batch.commit();

    onUpdateGameState({
      phase: "reveal",
      results: {
        correctAnswer,
        correctPlayerIds: correctIds,
        wrongPlayerIds: wrongIds,
        pointsDeltaMap,
        rankMap,
        totalCorrect: correctIds.length,
        correctPlayers: correctIds.map((id, i) => ({
          name: players.find(p => p.id === id)?.name || "Unknown",
          rank: i + 1,
          points: Math.max(0, maxPoints - i * pointDecay),
        })),
      },
    } as any);
    setSaving(false);
  };

  return (
    <div className="w-full space-y-6 font-mono">
      {isLobby ? (
        <div className="space-y-6 p-4 border border-secondary/40 bg-secondary/5">
          <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">Black Hole — Pyramid Puzzle Setup</h3>

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

            <div className="border border-border bg-background p-2">
              <img
                src={`/blackhole/${selectedPuzzle}`}
                alt={`Puzzle ${currentPuzzle.puzzle_number}`}
                className="w-full max-h-64 object-contain"
              />
            </div>

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
                {answerVisible ? `Show ${correctAnswer}` : "Show Answer"}
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] text-textMuted uppercase tracking-widest block">1st Place Points</label>
              <input
                type="number"
                value={maxPoints}
                onChange={e => setMaxPoints(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-textMuted uppercase tracking-widest block">Points Decay / Rank</label>
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
          {selectedPuzzle && (
            <div className="border border-border bg-background p-2">
              <img
                src={`/blackhole/${selectedPuzzle}`}
                alt="Current puzzle"
                className="w-full max-h-48 object-contain"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 border border-border bg-surface p-4 text-center text-xs">
            <div>
              <p className="text-[10px] text-textMuted uppercase mb-1">Players</p>
              <p className="text-xl font-bold">{alivePlayers.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-textMuted uppercase mb-1">Marked Correct</p>
              <p className="text-xl font-bold text-secondary">{correctPlayerIds.size}</p>
            </div>
            <div>
              <p className="text-[10px] text-textMuted uppercase mb-1">Answer</p>
              <p className="text-xl font-bold text-amber-400">{correctAnswer}</p>
            </div>
          </div>

          <div className="border border-border bg-surface p-4">
            <p className="text-[10px] text-textMuted uppercase tracking-widest mb-3">
              Mark Correct Players ({correctPlayerIds.size} marked)
            </p>
            {alivePlayers.length === 0 ? (
              <p className="text-textMuted/50 text-xs text-center py-4 italic">No alive players.</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {alivePlayers.map(p => {
                  const isCorrect = correctPlayerIds.has(p.id);
                  return (
                    <motion.button
                      key={p.id}
                      onClick={() => toggleCorrect(p.id)}
                      whileTap={{ scale: 0.97 }}
                      className={`w-full flex items-center justify-between p-3 border text-xs transition-all ${
                        isCorrect
                          ? "border-secondary bg-secondary/10 text-secondary"
                          : "border-border text-textMuted hover:border-secondary/30"
                      }`}
                    >
                      <span className="font-bold">{p.name}</span>
                      <span className={`font-mono font-bold ${isCorrect ? "text-secondary" : "text-textMuted/30"}`}>
                        {isCorrect ? "✓ CORRECT" : "Mark correct"}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border border-border bg-surface p-3 space-y-2">
            <p className="text-[10px] text-textMuted uppercase tracking-widest">Points Preview</p>
            {Array.from(correctPlayerIds).map((id, i) => {
              const pts = Math.max(0, maxPoints - i * pointDecay);
              const player = players.find(p => p.id === id);
              return (
                <div key={id} className="flex justify-between items-center text-xs">
                  <span className="text-secondary">#{i + 1} {player?.name || "?"}</span>
                  <span className="text-secondary font-bold">+{pts} pts</span>
                </div>
              );
            })}
            {correctPlayerIds.size === 0 && (
              <p className="text-textMuted/50 text-xs italic">No players marked correct yet.</p>
            )}
          </div>

          {isActive && (
            <button
              onClick={handleStartRound}
              className="w-full py-3 border border-secondary text-secondary uppercase tracking-widest text-xs font-bold hover:bg-secondary hover:text-background transition-colors"
            >
              LOCK & START MARKING
            </button>
          )}

          {(isLocked || isActive) && (
            <button
              onClick={handleReveal}
              disabled={saving}
              className="w-full py-4 bg-secondary text-background font-bold uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-gold"
            >
              {saving ? "SAVING..." : `REVEAL — GIVE POINTS (${correctPlayerIds.size} correct)`}
            </button>
          )}

          {isReveal && (
            <div className="border border-secondary bg-secondary/10 p-4 text-center">
              <p className="text-secondary font-bold uppercase tracking-widest text-sm">Results Revealed</p>
              <p className="text-secondary text-xs mt-1">{correctPlayerIds.size} players marked correct</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
