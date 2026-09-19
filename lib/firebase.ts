import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, inMemoryPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBMQYHq8sqI9eiDEqiImNAjiRrCuLJoTMQ",
  authDomain: "solarithm-master.firebaseapp.com",
  projectId: "solarithm-master",
  storageBucket: "solarithm-master.firebasestorage.app",
  messagingSenderId: "560851710395",
  appId: "1:560851710395:web:14f29e7ab994666870d49e"
};

// Ensure only one instance of the app is initialized
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Authentication instance with in-memory persistence (ephemeral session)
export const auth = getAuth(app);
if (typeof window !== "undefined") {
  setPersistence(auth, inMemoryPersistence).catch(() => {});
}

// Standard initialization targets the true (default) database
export const db = getFirestore(app);

export { app };
export default app;
