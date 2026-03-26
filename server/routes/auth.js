/**
 * ParkEV - Authentication Routes
 * POST /api/auth/register, /api/auth/login, /api/auth/google
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const mockData = require('../models/mockData');
const { addActivity } = require('../models/mockData');
const { generateToken } = require('../middleware/auth');
const { verifyGoogleToken } = require('../config/firebase');

/**
 * POST /api/auth/register
 * Register a new user with owner + vehicle details
 */
router.post('/register', async (req, res) => {
    try {
        const { name, phone, email, password, affiliation, affiliationId, vehicleType, vehicleNumber, evChargingCapacity } = req.body;

        // Validation
        if (!name || !email || !password || !vehicleType || !vehicleNumber) {
            return res.status(400).json({ error: 'All required fields must be provided.' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        // Check if EV requires charging capacity
        if (vehicleType === 'EV' && !evChargingCapacity) {
            return res.status(400).json({ error: 'EV charging station capacity is required for electric vehicles.' });
        }

        // Check duplicate email
        const existingUser = mockData.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (existingUser) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const newUser = {
            userId: 'usr-' + Date.now(),
            email: email.toLowerCase(),
            name,
            phone: phone || '',
            passwordHash,
            vehicleType,
            vehicleNumber: vehicleNumber.toUpperCase(),
            evChargingCapacity: vehicleType === 'EV' ? evChargingCapacity : null,
            role: 'user',
            affiliation: affiliation || 'Other',
            affiliationId: affiliationId || null,
            createdAt: new Date().toISOString()
        };

        mockData.users.push(newUser);

        // Log activity
        addActivity('register', `New user registered: ${name} (${email}) — ${vehicleType} ${vehicleNumber}`, name, newUser.affiliation);

        // Generate JWT
        const token = generateToken(newUser);

        res.status(201).json({
            message: 'Registration successful!',
            token,
            user: {
                userId: newUser.userId,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                affiliation: newUser.affiliation,
                affiliationId: newUser.affiliationId,
                vehicleType: newUser.vehicleType,
                vehicleNumber: newUser.vehicleNumber
            }
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * POST /api/auth/login
 * Login with email + password, returns JWT
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        // Find user
        const user = mockData.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Generate JWT
        const token = generateToken(user);

        res.json({
            message: 'Login successful!',
            token,
            user: {
                userId: user.userId,
                name: user.name,
                email: user.email,
                role: user.role,
                affiliation: user.affiliation || 'Other',
                affiliationId: user.affiliationId || null,
                vehicleType: user.vehicleType,
                vehicleNumber: user.vehicleNumber
            }
        });

        // Log activity
        addActivity(user.role === 'admin' ? 'admin_login' : 'login', `${user.name} logged in (${user.email})`, user.name, user.affiliation);
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * POST /api/auth/google
 * Google Sign-In: verify Firebase ID token, upsert user, return JWT
 */
router.post('/google', async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: 'Google ID token is required.' });
        }

        const decoded = await verifyGoogleToken(idToken);

        // Check if user exists
        let user = mockData.users.find(u => u.email.toLowerCase() === decoded.email.toLowerCase());

        if (!user) {
            // Create new user from Google profile
            user = {
                userId: 'usr-g-' + Date.now(),
                email: decoded.email,
                name: decoded.name || 'Google User',
                phone: '',
                passwordHash: '',
                vehicleType: 'Petrol',
                vehicleNumber: 'NOT-SET',
                evChargingCapacity: null,
                role: 'user',
                affiliation: 'Other',
                affiliationId: null,
                createdAt: new Date().toISOString(),
                googleUid: decoded.uid,
                profilePicture: decoded.picture || null
            };
            mockData.users.push(user);
        }

        const token = generateToken(user);

        res.json({
            message: 'Google login successful!',
            token,
            user: {
                userId: user.userId,
                name: user.name,
                email: user.email,
                role: user.role,
                vehicleType: user.vehicleType,
                vehicleNumber: user.vehicleNumber
            }
        });
    } catch (err) {
        console.error('Google auth error:', err);
        res.status(401).json({ error: err.message || 'Google authentication failed.' });
    }
});

module.exports = router;
