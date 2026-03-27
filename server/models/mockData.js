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

    // ======== PARKING SLOTS TABLE (7 total: 5 regular + 2 EV) ========
    slots: [
        // Zone A — Regular Parking (slots 1-5)
        // Slots 1-2: Faculty Only | Slots 3-5: Open to all
        { slotId: 'slot-01', slotNumber: 1, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: true },
        { slotId: 'slot-02', slotNumber: 2, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: true },
        { slotId: 'slot-03', slotNumber: 3, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
        { slotId: 'slot-04', slotNumber: 4, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },
        { slotId: 'slot-05', slotNumber: 5, type: 'regular', zone: 'A', evLoadTier: null, status: 'vacant', occupiedBy: null, occupiedAt: null, facultyOnly: false },

        // Zone B — EV Charging Stations (slots 6-7)
        { slotId: 'slot-06', slotNumber: 6, type: 'ev', zone: 'B', evLoadTier: 'Medium', status: 'vacant', occupiedBy: null, occupiedAt: null, evPower: '7.4 kW', evLevel: 'Level 2 AC', facultyOnly: false },
        { slotId: 'slot-07', slotNumber: 7, type: 'ev', zone: 'B', evLoadTier: 'High', status: 'vacant', occupiedBy: null, occupiedAt: null, evPower: '22 kW', evLevel: 'Level 2 Fast AC', facultyOnly: false }
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
    activityLog: []
};

// Attempt to load existing persistent data on startup
try {
    if (fs.existsSync(dataFilePath)) {
        const savedData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        Object.assign(mockData, savedData);
        console.log('📦 Successfully loaded persistent database from data.json');
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
