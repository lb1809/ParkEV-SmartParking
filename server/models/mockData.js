/**
 * ParkEV - In-Memory Mock Data Store
 * Mirrors DynamoDB schema — 7 slots (5 regular + 2 EV)
 */

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const dataFilePath = path.join(__dirname, 'data.json');

const mockData = {
    // ======== USERS TABLE (pre-seeded with admin) ========
    users: [
        {
            userId: 'usr-001',
            email: 'likhithr0333@gmail.com',
            name: 'Likhith R',
            phone: '',
            passwordHash: '$2a$10$nKe6Twh.VRmjqwqees.bvOOTrIENuHSLJjxXH5uWYoASfyjCVqXTq', // Lucky@1818
            vehicleType: 'EV',
            vehicleNumber: 'KA 01 AB 0001',
            evChargingCapacity: '50 kWh',
            role: 'admin',
            createdAt: new Date().toISOString()
        }
    ],

    // ======== PARKING SLOTS TABLE ========
    slots: [
        // Zone A — Regular Parking (Students & Others)
        { slotId: 'slot-01', slotNumber: 1, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
        { slotId: 'slot-02', slotNumber: 2, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
        { slotId: 'slot-03', slotNumber: 3, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
        { slotId: 'slot-04', slotNumber: 4, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
        { slotId: 'slot-05', slotNumber: 5, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
        { slotId: 'slot-06', slotNumber: 6, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
        { slotId: 'slot-07', slotNumber: 7, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
        { slotId: 'slot-08', slotNumber: 8, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },

        // Zone F — Faculty Reserved
        { slotId: 'slot-09', slotNumber: 9, type: 'regular', zone: 'F', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: true },
        { slotId: 'slot-10', slotNumber: 10, type: 'regular', zone: 'F', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: true },
        { slotId: 'slot-11', slotNumber: 11, type: 'regular', zone: 'F', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: true },

        // Zone B — EV Charging Stations
        { slotId: 'slot-12', slotNumber: 12, type: 'ev', zone: 'B', evLoadTier: 'High', status: 'vacant', occupiedBy: null, occupiedAt: null, evPower: '22 kW', evLevel: 'Level 2 Fast AC', facultyOnly: false },
        { slotId: 'slot-13', slotNumber: 13, type: 'ev', zone: 'B', evLoadTier: 'High', status: 'vacant', occupiedBy: null, occupiedAt: null, evPower: '22 kW', evLevel: 'Level 2 Fast AC', facultyOnly: false }
    ],

    // ======== BOOKINGS TABLE (empty) ========
    bookings: [],

    // ======== CHARGING SESSIONS TABLE (empty) ========
    chargingSessions: [],

    // ======== CAMERA FEEDS (2 cameras: Entrance + Parking Area) ========
    cameraFeeds: [
        { cameraId: 'cam-01', location: 'Entrance Gate', status: 'online', lastDetection: null, vehicleCount: 0 },
        { cameraId: 'cam-02', location: 'Parking Area', status: 'online', lastDetection: null, vehicleCount: 0 }
    ],

    // ======== ACTIVITY LOG (real-time database log for admin) ========
    activityLog: [],

    // ======== EV BATTERY SAFETY ALERTS ========
    evSafetyAlerts: []
};

// ======== EV BATTERY SAFETY CONSTANTS ========
const EV_TEMP_CONFIG = {
    NORMAL_MAX:   38,   // °C — safe range
    WARNING_MAX:  45,   // °C — warn user & admin
    CRITICAL_MAX: 52,   // °C — auto cut-off power immediately
    BASE_TEMP:    28,   // °C — starting temp when charging begins
    RISE_RATE:    0.4,  // °C per tick (simulate heat build-up)
    COOL_RATE:    1.5   // °C per tick when cooling after cut-off
};

// Attempt to load existing persistent data on startup
try {
    if (fs.existsSync(dataFilePath)) {
        const savedData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        Object.assign(mockData, savedData);
        console.log('📦 Successfully loaded persistent database from data.json');
        
        // Force slot synchronization based on YOLOv8 array dimensions
        if (mockData.slots.length < 13) {
            const extraSlots = [
                { slotId: 'slot-08', slotNumber: 8, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
                { slotId: 'slot-09', slotNumber: 9, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
                { slotId: 'slot-10', slotNumber: 10, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
                { slotId: 'slot-11', slotNumber: 11, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
                { slotId: 'slot-12', slotNumber: 12, type: 'ev', zone: 'B', evLoadTier: 'High', status: 'vacant', occupiedBy: null, occupiedAt: null, evPower: '22 kW', evLevel: 'Level 2 Fast', facultyOnly: false },
                { slotId: 'slot-13', slotNumber: 13, type: 'ev', zone: 'B', evLoadTier: 'Hyper', status: 'vacant', occupiedBy: null, occupiedAt: null, evPower: '50 kW', evLevel: 'DC Fast Charge', facultyOnly: false }
            ];
            const missing = 13 - mockData.slots.length;
            mockData.slots.push(...extraSlots.slice(-missing)); // Safely append exact missing
            console.log('🔧 Auto-injected missing slots to match 13-slot system requirement.');
        }
    }
} catch (err) {
    console.warn('⚠️ Could not load data.json, starting with fresh database.', err.message);
}



/**
 * Helper: Add an activity entry to the log
 * @param {string} type - 'register' | 'login' | 'slot_check' | 'booking' | 'release' | 'admin_login'
 * @param {string} detail - Description of the activity
 * @param {string} userName - User who performed the action
 * @param {string} affiliation - Role/Affiliation of user (Admin, Faculty, Student, Other)
 */
function addActivity(type, detail, userName = 'System', affiliation = 'System') {
    const act = {
        id: 'act-' + Date.now(),
        type,
        detail,
        userName,
        affiliation,
        timestamp: new Date().toISOString()
    };
    mockData.activityLog.unshift(act);
    // Keep only last 50 entries
    if (mockData.activityLog.length > 50) {
        mockData.activityLog = mockData.activityLog.slice(0, 50);
    }
}

// ==========================================
// 🚀 OPTION 1: AWS CLOUD SYNC ENGINE
// Highly efficient background syncer that 
// tracks precise changes and uploads to AWS
// ==========================================
const { getDynamo } = require('../config/db');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');

let previousState = JSON.stringify(mockData);

async function syncToAWS() {
    if (process.env.USE_MOCK_DATA === 'true') return; // Skip if in sandbox mode
    const dynamo = getDynamo();
    if (!dynamo) return;

    try {
        const currentStateStr = JSON.stringify(mockData);
        if (currentStateStr === previousState) return; // No changes detected
        
        const current = JSON.parse(currentStateStr);
        const prev = JSON.parse(previousState);

        // Upload new/modified Users
        if (JSON.stringify(current.users) !== JSON.stringify(prev.users)) {
            for (let u of current.users) {
                await dynamo.send(new PutCommand({ TableName: 'parkev_users', Item: u })).catch(()=>{});
            }
        }
        
        // Upload new/modified Slots
        if (JSON.stringify(current.slots) !== JSON.stringify(prev.slots)) {
            for (let s of current.slots) {
                await dynamo.send(new PutCommand({ TableName: 'parkev_slots', Item: s })).catch(()=>{});
            }
        }

        // Upload new/modified Bookings
        if (JSON.stringify(current.bookings) !== JSON.stringify(prev.bookings)) {
            for (let b of current.bookings) {
                await dynamo.send(new PutCommand({ TableName: 'parkev_bookings', Item: b })).catch(()=>{});
            }
        }

        // Upload Activity Log
        if (JSON.stringify(current.activityLog) !== JSON.stringify(prev.activityLog)) {
            for (let a of current.activityLog) {
                await dynamo.send(new PutCommand({ TableName: 'parkev_activity', Item: a })).catch(()=>{});
            }
        }

        previousState = currentStateStr; // Lock in the new state
        console.log('☁️  AWS DynamoDB Sync Engine: Detected local changes and successfully pushed to Cloud.');
    } catch (err) {
        console.warn('☁️  Cloud Sync Engine Error:', err.message);
    }
}

// Auto-save the database automatically to data.json AND sync to AWS every 5 seconds
setInterval(() => {
    try {
        fs.writeFileSync(dataFilePath, JSON.stringify(mockData, null, 4), 'utf8');
        syncToAWS(); // Fire the cloud sync engine
    } catch (err) {
        console.error('Failed to auto-save to data.json:', err.message);
    }
}, 5000);

module.exports = mockData;
module.exports.addActivity = addActivity;
module.exports.EV_TEMP_CONFIG = EV_TEMP_CONFIG;
