import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCVuRau0g7g8uX7L-n1wX64DGBKWriSX48",
  authDomain: "kensyu10085.firebaseapp.com",
  databaseURL: "https://kensyu10085-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kensyu10085",
  storageBucket: "kensyu10085.firebasestorage.app",
  messagingSenderId: "676207024399",
  appId: "1:676207024399:web:abf49fc3bd3a506645867a",
  measurementId: "G-H7FWG2TKYJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
