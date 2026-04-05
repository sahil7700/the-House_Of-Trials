import { db, auth } from "@/lib/firebase";
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, onSnapshot, updateDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export interface PlayerData {
  id: string; // auth uid
  playerId: string; // #0147 format
  name: string;
  college: string;
  phone: string;
  status: "waiting" | "alive" | "eliminated" | "winner";
  points: number; // accumulated across all games
  gamesPlayed: number;
  gamesWon: number;
  joinedAt: any;
  currentSubmission: any | null; // useful for dashboard live view
  submittedAt: any | null;
  isWildCard?: boolean;
  revivalCount?: number; // how many times player used wild card re-entry
  totalRevivals?: number; // max allowed revivals per event
  eliminatedAt?: any;
  lastSeen?: any;
}

export const registerPlayer = async (name: string, college: string, phone: string, isWildCard: boolean = false) => {
  // 1. Ensure signed in anonymously
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  const uid = auth.currentUser!.uid;

  // 2. Check if already registered or if name is taken
  const docRef = doc(db, "players", uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as PlayerData;
  }

  // 2.5 Ensure name is unique (case-insensitive)
  const nameQuery = query(
    collection(db, "players"),
    where("name", "==", name.trim())
  );
  const nameSnap = await getDocs(nameQuery);
  if (!nameSnap.empty) {
    throw new Error("A player with this name already exists. Please choose a slightly different name.");
  }

  // 3. Generate unique 4 digit ID
  let playerId = "";
  let isUnique = false;
  while (!isUnique) {
    const num = Math.floor(1000 + Math.random() * 9000);
    playerId = `#${num}`;
    const q = query(collection(db, "players"), where("playerId", "==", playerId));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      isUnique = true;
    }
  }

  const playerData: PlayerData = {
    id: uid,
    playerId,
    name: name.trim(),
    college: college.trim(),
    phone: phone?.trim() || "",
    status: isWildCard ? "waiting" : "alive",
    isWildCard,
    points: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    joinedAt: serverTimestamp(),
    currentSubmission: null,
    submittedAt: null,
    revivalCount: 0,
    totalRevivals: 1, // Default: only 1 wild card re-entry allowed per event
  };

  await setDoc(docRef, playerData);
  
  if (typeof window !== "undefined") {
    localStorage.setItem("house_of_trials_player_id", uid);
  }

  return playerData;
};

// Claim wild card re-entry (with revival count limit)
export const claimWildCard = async (
  uid: string,
  maxRevivals: number = 1
): Promise<{ success: boolean; error?: string }> => {
  const docRef = doc(db, "players", uid);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return { success: false, error: "Player not found." };
  }
  
  const data = docSnap.data() as PlayerData;
  
  // Check if player is eligible
  if (data.status !== "eliminated") {
    return { success: false, error: "You are not eliminated." };
  }
  
  // Check revival count
  const currentRevivals = data.revivalCount || 0;
  const maxAllowed = data.totalRevivals ?? maxRevivals;
  
  if (currentRevivals >= maxAllowed) {
    return {
      success: false,
      error: `Wild card limit reached. You can only be revived ${maxAllowed} time(s) per event.`,
    };
  }

  await updateDoc(docRef, {
    status: "alive",
    currentSubmission: null,
    submittedAt: null,
    revivalCount: currentRevivals + 1,
    lastSeen: serverTimestamp(),
  });

  return { success: true };
};

export const getPlayer = async (uid: string): Promise<PlayerData | null> => {
  const docRef = doc(db, "players", uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as PlayerData;
  }
  return null;
};

export const subscribeToPlayer = (uid: string, callback: (player: PlayerData | null) => void) => {
  const docRef = doc(db, "players", uid);
  return onSnapshot(docRef, (docSnap: any) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as PlayerData);
    } else {
      callback(null);
    }
  });
};
