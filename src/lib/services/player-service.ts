import { db, auth } from "@/lib/firebase";
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
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
}


export const registerPlayer = async (name: string, college: string, phone: string) => {
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

  // 2.5 Ensure name is unique
  const nameQuery = query(collection(db, "players"), where("name", "==", name));
  const nameSnap = await getDocs(nameQuery);
  if (!nameSnap.empty) {
    throw new Error("A player with this name already exists. Please choose a slightly different name.");
  }

  // 3. Generate unique 4 digit ID (rough uniqueness check can be skipped for prototype)
  // To avoid duplicates, we will just generate and hope no collisions, or do a tiny loop
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
    name,
    college,
    phone,
    status: "alive",
    points: 0,
    gamesPlayed: 0,

    gamesWon: 0,
    joinedAt: serverTimestamp(),
    currentSubmission: null,
    submittedAt: null,
  };

  await setDoc(docRef, playerData);
  
  // Cache the ID locally just in case
  if (typeof window !== "undefined") {
    localStorage.setItem("house_of_trials_player_id", uid);
  }

  return playerData;
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
