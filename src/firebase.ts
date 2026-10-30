/**
 * Firebase Firestore Configuration for Gloves Factory ERP - Auto System
 * Connected permanently to Firebase Firestore with real-time onSnapshot listeners
 */
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  Firestore,
  collection, 
  collectionGroup,
  doc, 
  getDoc,
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  writeBatch,
  runTransaction,
  increment,
  arrayUnion,
  serverTimestamp
} from 'firebase/firestore';
import appletConfig from '../firebase-applet-config.json';

// Active Firebase Configuration from Cloud Provisioning
export const firebaseConfig = {
  apiKey: appletConfig.apiKey,
  authDomain: appletConfig.authDomain,
  projectId: appletConfig.projectId,
  storageBucket: appletConfig.storageBucket,
  messagingSenderId: appletConfig.messagingSenderId,
  appId: appletConfig.appId,
  firestoreDatabaseId: appletConfig.firestoreDatabaseId
};

let app: FirebaseApp;
let db: Firestore;
let isFirebaseOnline: boolean = true;

try {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }

  // Use the dedicated databaseId provisioned for this ERP
  db = firebaseConfig.firestoreDatabaseId 
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

  isFirebaseOnline = true;
} catch (error: any) {
  console.error("Firebase initialization failed:", error?.message);
  isFirebaseOnline = false;
  // Fallback to default
  app = getApps()[0] || initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export { 
  app, 
  db, 
  isFirebaseOnline,
  collection, 
  collectionGroup,
  doc, 
  getDoc,
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  writeBatch,
  runTransaction,
  increment,
  arrayUnion,
  serverTimestamp
};
export default app;
