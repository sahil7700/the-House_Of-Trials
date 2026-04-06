import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { step } = await req.json();

    await updateDoc(doc(db, "system", "gameState"), {
      b8RevealStep: Number(step),
    });

    return NextResponse.json({ success: true, step });
  } catch (error: any) {
    console.error("B8 reveal error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
