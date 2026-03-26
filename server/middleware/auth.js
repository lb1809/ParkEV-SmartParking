/**
 * ParkEV - JWT Authentication Middleware
 */

const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'parkev_default_secret';

/**
 * Middleware to verify JWT token from Authorization header
 */
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

/**
 * Middleware to check admin role
 */
function isAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

/**
 * Generate a JWT token for a user
 */
function generateToken(user) {
    return jwt.sign(
        {
            userId: user.userId,
            email: user.email,
            name: user.name,
            role: user.role || 'user',
            affiliation: user.affiliation || 'Other',
            affiliationId: user.affiliationId || null,
            vehicleType: user.vehicleType,
            vehicleNumber: user.vehicleNumber
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

module.exports = { authenticate, isAdmin, generateToken };
