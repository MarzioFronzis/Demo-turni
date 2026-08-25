import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC-WpS9hAsnPICKMJIo7cQcKrDKY8C6rY4",
  authDomain: "turni-3093b.firebaseapp.com",
  projectId: "turni-3093b",
  storageBucket: "turni-3093b.firebasestorage.app",
  messagingSenderId: "750924879766",
  appId: "1:750924879766:web:def6744d33a1a38cab6fb7",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
