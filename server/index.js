/**
 * ParkEV - Express Server Entry Point
 * Cloud-Based Smart Parking with EV Module
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initDynamo } = require('./config/db');
const { initFirebase } = require('./config/firebase');

const authRoutes = require('./routes/auth');
const slotRoutes = require('./routes/slots');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// ====== Security Middleware ======
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: '*', // Allow all origins for Wi-Fi hosting on local network
    credentials: true
}));

// Rate limiting — raised to 2000 req per 15 min to support admin auto-refresh polling
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    message: { error: 'Too many requests. Please try again later.' },
    skip: (req) => req.path === '/api/health' // health checks don't count
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====== Serve Static Frontend ======
app.use(express.static(path.join(__dirname, '..')));

// ====== API Routes ======
app.use('/api/auth', authRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

// ====== Health Check ======
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'ParkEV Smart Parking API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
        dataLayer: process.env.USE_MOCK_DATA === 'true' ? 'mock' : 'dynamodb'
    });
});

// ====== Error Handler ======
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
});

// ====== 404 Handler ======
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found.' });
    }
    // For non-API routes, serve login
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// ====== Initialize & Start ======
async function start() {
    // Initialize AWS DynamoDB (or mock)
    initDynamo();

    // Initialize Firebase Admin (for Google Sign-In)
    initFirebase();

    app.listen(PORT, '0.0.0.0', () => {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        let localIp = 'localhost';
        
        for (let name in interfaces) {
            for (let iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIp = iface.address;
                    break;
                }
            }
        }

        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🅿️  ParkEV Smart Parking Server              ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  🌐 API (Local):  http://localhost:${PORT}/api   ║`);
        console.log(`║  📶 WiFi Host:    http://${localIp}:${PORT}     ║`);
        console.log('║  📊 Health:       /api/health                ║');
        console.log('╚══════════════════════════════════════════════╝');
        console.log('  Connect your other devices to:');
        console.log(`  http://${localIp}:${PORT}`);
        console.log('');
    });
}

start();
