const fs = require('fs');
const path = require('path');

const c9adminPath = path.join(__dirname, 'src/app/admin/dashboard/components/GameC9Admin.tsx');
const c9Path = path.join(__dirname, 'src/app/game/components/GameC9.tsx');

let adminCode = fs.readFileSync(c9adminPath, 'utf8');
let playerCode = fs.readFileSync(c9Path, 'utf8');

// Replace handleCreatePairs
adminCode = adminCode.replace(/const handleCreatePairs = async \(\) => \{[\s\S]*?finally \{\s*setLoading\(false\);\s*\}\s*\};/,
`const handleCreatePairs = async () => {
    setLoading(true);
    setError(null);
    try {
      const { collection, doc, writeBatch, getDocs, query, where } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      
      const playersSnap = await getDocs(query(collection(db, "players"), where("status", "==", "alive")));
      const alivePlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (alivePlayers.length < 2) throw new Error("Need at least 2 alive players to form pairs");
      
      const shuffled = [...alivePlayers].sort(() => 0.5 - Math.random());
      let byePlayer = null;
      let pairedPlayers = shuffled;
      if (shuffled.length % 2 !== 0) {
        const byeIndex = Math.floor(Math.random() * shuffled.length);
        byePlayer = shuffled.splice(byeIndex, 1)[0];
      }

      const newPairs = [];
      const batch = writeBatch(db);

      for (let i = 0; i < pairedPlayers.length; i += 2) {
        const pairId = \`pair_\${gameState.currentSlot}_\${i / 2 + 1}\`;
        const p = {
          pairId, pairIndex: i / 2 + 1, slotNumber: gameState.currentSlot,
          playerAId: pairedPlayers[i].id, playerAName: String(pairedPlayers[i].name || pairedPlayers[i].id),
          playerBId: pairedPlayers[i + 1].id, playerBName: String(pairedPlayers[i + 1].name || pairedPlayers[i + 1].id),
          playerA_sequence: null, playerB_sequence: null, playerA_guess: null, playerB_guess: null,
          playerA_score: null, playerB_score: null, winnerId: null, loserId: null, tied: false, byePair: false,
        };
        newPairs.push(p);
        batch.set(doc(db, "sequencePairs", pairId), p);
      }

      if (byePlayer) {
        const byePairId = \`pair_\${gameState.currentSlot}_bye\`;
        const p = {
          pairId: byePairId, pairIndex: newPairs.length + 1, slotNumber: gameState.currentSlot,
          playerAId: byePlayer.id, playerAName: String(byePlayer.name || byePlayer.id),
          playerBId: "BYE", playerBName: "BYE — Auto-advance",
          playerA_sequence: null, playerB_sequence: null, playerA_guess: null, playerB_guess: null,
          playerA_score: null, playerB_score: null, winnerId: null, loserId: null, tied: false, byePair: true,
        };
        newPairs.push(p);
        batch.set(doc(db, "sequencePairs", byePairId), p);
      }

      batch.update(doc(db, "system", "gameState"), {
        sequencePairsCreated: true,
        sequenceByePlayerId: byePlayer?.id || null,
        sequenceTiedPairs: [],
        sequenceRevealStep: 0,
      });

      await batch.commit();
      setPairs(newPairs);
      
      onUpdateGameState?.({
        sequencePairsCreated: true, sequenceByePlayerId: byePlayer?.id || null, pendingEliminations: [], results: null
      } as any);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };`);

// Replace handleStartPhaseA
adminCode = adminCode.replace(/const handleStartPhaseA = async \(\) => \{[\s\S]*?finally \{\s*setLoading\(false\);\s*\}\s*\};/,
`const handleStartPhaseA = async () => {
    setLoading(true);
    try {
      const config = { phaseASeconds, phaseBSeconds, showOpponentName, exactMatchBonus: 10, winnerPoints: 80, loserPoints: 0, tieRule };
      const { doc, writeBatch, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const batch = writeBatch(db);
      batch.update(doc(db, "system", "gameState"), {
        phase: "phase_a_open", sequenceConfig: config, sequencePhaseAStartedAt: serverTimestamp(), submissionsCount: 0
      });
      await batch.commit();
      onUpdateGameState?.({ phase: "phase_a_open", sequenceConfig: config, sequencePhaseAStartedAt: new Date(), submissionsCount: 0 } as any);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };`);

// Replace handleLockPhaseA
adminCode = adminCode.replace(/const handleLockPhaseA = async \(\) => \{[\s\S]*?finally \{\s*setLoading\(false\);\s*\}\s*\};/,
`const handleLockPhaseA = async () => {
    setLoading(true);
    try {
      const { doc, writeBatch, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const batch = writeBatch(db);
      batch.update(doc(db, "system", "gameState"), {
        phase: "phase_b_open", sequencePhaseAStartedAt: null, sequencePhaseBStartedAt: serverTimestamp()
      });
      await batch.commit();
      await fetchPairs();
      onUpdateGameState?.({ phase: "phase_b_open", sequencePhaseAStartedAt: null, sequencePhaseBStartedAt: new Date() } as any);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };`);

// Replace handleLockPhaseB
adminCode = adminCode.replace(/const handleLockPhaseB = async \(\) => \{[\s\S]*?finally \{\s*setLoading\(false\);\s*\}\s*\};/,
`const handleLockPhaseB = async () => {
    setLoading(true);
    try {
      const { doc, writeBatch } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const batch = writeBatch(db);
      batch.update(doc(db, "system", "gameState"), { phase: "phase_b_locked", sequencePhaseBStartedAt: null });
      await batch.commit();
      await fetchPairs();
      onUpdateGameState?.({ phase: "phase_b_locked", sequencePhaseBStartedAt: null } as any);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };`);

fs.writeFileSync(c9adminPath, adminCode);

// Player Component
playerCode = playerCode.replace(/const submitSequence = async \(\) => \{[\s\S]*?catch \(e\) \{ console\.error\(e\); \}\s*\};/,
`const submitSequence = async () => {
    if (hasSubmittedA) return;
    try {
      const { doc, updateDoc, serverTimestamp, collection, getDocs, query, where } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const snap = await getDocs(query(collection(db, "sequencePairs"), where("slotNumber", "==", gameState.currentSlot)));
      const pair = snap.docs.find(d => d.data().playerAId === playerId || d.data().playerBId === playerId);
      if (!pair) return;
      
      const isA = pair.data().playerAId === playerId;
      await updateDoc(doc(db, "sequencePairs", pair.id), {
        [isA ? "playerA_sequence" : "playerB_sequence"]: mySequence,
      });
      await updateDoc(doc(db, "players", playerId), {
        currentSubmission: { type: "sequence", value: mySequence },
        submittedAt: serverTimestamp()
      });
      setHasSubmittedA(true);
    } catch (e) { console.error(e); }
  };`);

playerCode = playerCode.replace(/const submitGuess = async \(\) => \{[\s\S]*?catch \(e\) \{ console\.error\(e\); \}\s*\};/,
`const submitGuess = async () => {
    if (hasSubmittedB) return;
    try {
      const { doc, updateDoc, serverTimestamp, collection, getDocs, query, where } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const snap = await getDocs(query(collection(db, "sequencePairs"), where("slotNumber", "==", gameState.currentSlot)));
      const pair = snap.docs.find(d => d.data().playerAId === playerId || d.data().playerBId === playerId);
      if (!pair) return;
      
      const isA = pair.data().playerAId === playerId;
      await updateDoc(doc(db, "sequencePairs", pair.id), {
        [isA ? "playerA_guess" : "playerB_guess"]: myGuess,
      });
      await updateDoc(doc(db, "players", playerId), {
        currentSubmission: { type: "guess", value: myGuess },
        submittedAt: serverTimestamp()
      });
      setHasSubmittedB(true);
    } catch (e) { console.error(e); }
  };`);

fs.writeFileSync(c9Path, playerCode);
console.log("C9 Modified Successfully.");
