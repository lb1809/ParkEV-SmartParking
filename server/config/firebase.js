/**
 * ParkEV - Firebase Admin Configuration
 * Verifies Google Sign-In ID tokens sent from the browser.
 * Uses Firebase Admin initialized with just the projectId so no
 * service-account JSON file is required on the dev machine.
 */

require('dotenv').config();

let firebaseAdmin = null;

function initFirebase() {
    try {
        const admin = require('firebase-admin');

        if (admin.apps.length > 0) {
            firebaseAdmin = admin;
            return; // already initialised
        }

        // Try service-account file first (production path)
        const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        if (saPath && saPath !== './config/firebase-service-account.json') {
            try {
                const serviceAccount = require(saPath);
                admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
                firebaseAdmin = admin;
                console.log('🔥 Firebase Admin initialised with service account');
                return;
            } catch (e) {
                console.warn('⚠️  Service account file not found, falling back to projectId init');
            }
        }

        // Lightweight init — uses the project ID so verifyIdToken() works
        // by fetching Google's public keys automatically (no private key needed).
        admin.initializeApp({
            projectId: 'parkev-25e5b'
        });
        firebaseAdmin = admin;
        console.log('🔥 Firebase Admin initialised (projectId mode — Google Sign-In verification active)');

    } catch (err) {
        console.warn('⚠️  Firebase init skipped:', err.message);
    }
}

async function verifyGoogleToken(idToken) {
    // Development shortcut: if token starts with "mock-" skip real verification
    if (idToken && idToken.startsWith('mock-')) {
        console.log('⚠️  Mock Google token received — skipping real Firebase verification');
        return {
            uid: 'google-mock-' + Date.now(),
            email: 'google.user@gmail.com',
            name: 'Google User',
            picture: 'https://ui-avatars.com/api/?name=Google+User&background=4285f4&color=fff'
        };
    }

    if (!firebaseAdmin) {
        throw new Error('Firebase not initialised. Google Sign-In unavailable.');
    }

    try {
        const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
        return decoded;
    } catch (err) {
        throw new Error('Invalid Google ID token: ' + err.message);
    }
}

module.exports = { initFirebase, verifyGoogleToken };
