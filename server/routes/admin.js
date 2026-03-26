/**
 * ParkEV - Admin Routes
 * All routes require admin role
 */

const express = require('express');
const router = express.Router();
const mockData = require('../models/mockData');
const { authenticate, isAdmin } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(authenticate, isAdmin);

/**
 * GET /api/admin/users
 * List all registered users
 */
router.get('/users', (req, res) => {
    const users = mockData.users.map(u => ({
        userId: u.userId,
        name: u.name,
        email: u.email,
        phone: u.phone,
        vehicleType: u.vehicleType,
        vehicleNumber: u.vehicleNumber,
        evChargingCapacity: u.evChargingCapacity,
        affiliation: u.affiliation || 'Other',
        role: u.role,
        createdAt: u.createdAt
    }));

    res.json({ users, total: users.length });
});

/**
 * PUT /api/admin/slots/:id
 * Update slot status (vacant/occupied/maintenance)
 */
router.put('/slots/:id', (req, res) => {
    const slotId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['vacant', 'occupied', 'maintenance'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: vacant, occupied, or maintenance.' });
    }

    const slot = mockData.slots.find(s => s.slotId === slotId);
    if (!slot) {
        return res.status(404).json({ error: 'Slot not found.' });
    }

    // If setting to vacant, clear occupant
    if (status === 'vacant') {
        slot.occupiedBy = null;
        slot.occupiedAt = null;

        // Complete any active bookings for this slot
        const activeBooking = mockData.bookings.find(b => b.slotId === slotId && b.status === 'active');
        if (activeBooking) {
            activeBooking.status = 'completed';
            activeBooking.endTime = new Date().toISOString();
        }
    }

    slot.status = status;

    res.json({ message: `Slot ${slot.slotNumber} updated to ${status}.`, slot });
});

/**
 * GET /api/admin/bookings
 * All bookings (with user info)
 */
router.get('/bookings', (req, res) => {
    const bookings = mockData.bookings
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(booking => {
            const user = mockData.users.find(u => u.userId === booking.userId);
            const slot = mockData.slots.find(s => s.slotId === booking.slotId);
            return {
                ...booking,
                userName: user ? user.name : 'Unknown',
                userEmail: user ? user.email : 'N/A',
                userAffiliation: user ? user.affiliation : 'Other',
                slotNumber: slot ? slot.slotNumber : null,
                slotType: slot ? slot.type : null
            };
        });

    res.json({ bookings, total: bookings.length });
});

/**
 * GET /api/admin/stats
 * Dashboard statistics summary
 */
router.get('/stats', (req, res) => {
    const totalUsers = mockData.users.length;
    const totalBookings = mockData.bookings.length;
    const activeBookings = mockData.bookings.filter(b => b.status === 'active').length;
    const completedBookings = mockData.bookings.filter(b => b.status === 'completed').length;
    const totalRevenue = mockData.bookings.reduce((sum, b) => sum + (b.amount || 0), 0);

    const evUsers = mockData.users.filter(u => u.vehicleType === 'EV').length;
    const petrolUsers = mockData.users.filter(u => u.vehicleType === 'Petrol').length;
    const dieselUsers = mockData.users.filter(u => u.vehicleType === 'Diesel').length;

    const vacantSlots = mockData.slots.filter(s => s.status === 'vacant').length;
    const occupiedSlots = mockData.slots.filter(s => s.status === 'occupied').length;

    const activeSessions = mockData.chargingSessions.filter(cs => cs.chargingStatus === 'charging').length;

    res.json({
        stats: {
            totalUsers,
            totalBookings,
            activeBookings,
            completedBookings,
            totalRevenue,
            vehicleDistribution: { ev: evUsers, petrol: petrolUsers, diesel: dieselUsers },
            slotStatus: { vacant: vacantSlots, occupied: occupiedSlots, total: mockData.slots.length },
            activeChargingSessions: activeSessions
        }
    });
});

/**
 * POST /api/admin/notify
 * Send bulk notification (mock implementation)
 */
router.post('/notify', (req, res) => {
    const { message, type } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    // In production, this would use AWS SNS/SES
    console.log(`📢 Admin Notification [${type || 'info'}]:`, message);

    res.json({
        message: 'Notification sent successfully!',
        recipients: mockData.users.length,
        type: type || 'info'
    });
});

/**
 * GET /api/admin/activity
 * Real-time activity log — shows all user actions (login, register, slot checks, bookings)
 */
router.get('/activity', (req, res) => {
    res.json({
        activities: mockData.activityLog,
        total: mockData.activityLog.length
    });
});

module.exports = router;
