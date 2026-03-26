/**
 * ParkEV - In-Memory Mock Data Store
 * Mirrors DynamoDB schema — 7 slots (5 regular + 2 EV)
 */

const bcrypt = require('bcryptjs');

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

/**
 * Helper: Add an activity entry to the log
 * @param {string} type - 'register' | 'login' | 'slot_check' | 'booking' | 'release' | 'admin_login'
 * @param {string} detail - Description of the activity
 * @param {string} userName - User who performed the action
 * @param {string} affiliation - Role/Affiliation of user (Admin, Faculty, Student, Other)
 */
function addActivity(type, detail, userName = 'System', affiliation = 'System') {
    mockData.activityLog.unshift({
        id: 'act-' + Date.now(),
        type,
        detail,
        userName,
        affiliation,
        timestamp: new Date().toISOString()
    });
    // Keep only last 50 entries
    if (mockData.activityLog.length > 50) {
        mockData.activityLog = mockData.activityLog.slice(0, 50);
    }
}

module.exports = mockData;
module.exports.addActivity = addActivity;
