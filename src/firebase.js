import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Replace these values with your Firebase Web App config.
const firebaseConfig = {
  apiKey: "AIzaSyCq5rLlmJxyOYr4Dv2qGqYaNHRT4dctO5Q",
  authDomain: "netflix-splitter.firebaseapp.com",
  databaseURL: "https://netflix-splitter-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "netflix-splitter",
  storageBucket: "netflix-splitter.firebasestorage.app",
  messagingSenderId: "162186239219",
  appId: "1:162186239219:web:68f744aae5a869aec96b86",
  measurementId: "G-71L1WS966B"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
