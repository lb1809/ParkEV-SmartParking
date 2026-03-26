/**
 * ParkEV - Booking Routes
 * GET /api/bookings, GET /api/bookings/active
 */

const express = require('express');
const router = express.Router();
const mockData = require('../models/mockData');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/bookings
 * Get current user's booking history (auth required)
 */
router.get('/', authenticate, (req, res) => {
    const userId = req.user.userId;
    const userBookings = mockData.bookings
        .filter(b => b.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Enrich with slot info
    const enriched = userBookings.map(booking => {
        const slot = mockData.slots.find(s => s.slotId === booking.slotId);
        return {
            ...booking,
            slotNumber: slot ? slot.slotNumber : null,
            slotType: slot ? slot.type : null,
            evLoadTier: slot ? slot.evLoadTier : null,
            evPower: slot ? slot.evPower : null
        };
    });

    res.json({ bookings: enriched });
});

/**
 * GET /api/bookings/active
 * Get current user's active booking with real-time charging progress
 */
router.get('/active', authenticate, (req, res) => {
    const userId = req.user.userId;
    const activeBooking = mockData.bookings.find(b => b.userId === userId && b.status === 'active');

    if (!activeBooking) {
        return res.json({ booking: null });
    }

    const slot = mockData.slots.find(s => s.slotId === activeBooking.slotId);

    // If EV slot, include charging session with real-time progress
    let chargingSession = null;
    let chargingProgress = null;

    if (slot && slot.type === 'ev') {
        const session = mockData.chargingSessions.find(
            cs => cs.bookingId === activeBooking.bookingId && cs.chargingStatus === 'charging'
        );

        if (session) {
            chargingSession = { ...session };

            // Calculate real-time charging progress
            const elapsedMs = Date.now() - new Date(session.startedAt).getTime();
            const elapsedMins = elapsedMs / 60000;

            const initialPct = session.initialBatteryPct || 0;
            const estTotalMins = session.estimatedChargeMinutes || 120;
            const chargerKw = session.chargerKw || parseFloat(slot.evPower) || 7.4;
            const batteryKwh = session.batteryCapacityKwh || 40;

            // Calculate current battery % based on elapsed time
            // Energy delivered so far = chargerKw * efficiency * elapsedHours
            const efficiency = 0.9;
            const energyDelivered = chargerKw * efficiency * (elapsedMins / 60);
            const pctGained = (energyDelivered / batteryKwh) * 100;
            const currentPct = Math.min(100, Math.round(initialPct + pctGained));

            // Time remaining
            const remainingMins = Math.max(0, estTotalMins - elapsedMins);

            // Update energy delivered in session
            session.energyDelivered = +energyDelivered.toFixed(2);

            chargingProgress = {
                initialPct,
                currentPct,
                targetPct: 100,
                progressPct: Math.min(100, Math.round(((currentPct - initialPct) / (100 - initialPct)) * 100)),
                energyDelivered: +energyDelivered.toFixed(1),
                estimatedTotalKwh: session.estimatedKwh || 0,
                elapsedMinutes: Math.floor(elapsedMins),
                remainingMinutes: Math.ceil(remainingMins),
                remainingDisplay: remainingMins >= 60
                    ? `${Math.floor(remainingMins / 60)}h ${Math.ceil(remainingMins % 60)}m`
                    : `${Math.ceil(remainingMins)} min`,
                isComplete: currentPct >= 100
            };

            // Auto-complete charging if battery is full
            if (currentPct >= 100 && session.chargingStatus === 'charging') {
                session.chargingStatus = 'completed';
                session.completedAt = new Date().toISOString();
                chargingProgress.isComplete = true;
            }
        }
    }

    // Calculate planned duration info
    const elapsedMs = Date.now() - new Date(activeBooking.startTime).getTime();
    const elapsedMins = Math.floor(elapsedMs / 60000);
    const plannedDuration = activeBooking.plannedDuration || 60;
    const remainingParkingMins = Math.max(0, plannedDuration - elapsedMins);

    res.json({
        booking: {
            ...activeBooking,
            slotNumber: slot ? slot.slotNumber : null,
            slotType: slot ? slot.type : null,
            evLoadTier: slot ? slot.evLoadTier : null,
            evPower: slot ? slot.evPower : null,
            elapsedMinutes: elapsedMins,
            remainingMinutes: remainingParkingMins,
            remainingDisplay: remainingParkingMins >= 60
                ? `${Math.floor(remainingParkingMins / 60)}h ${remainingParkingMins % 60}m`
                : `${remainingParkingMins} min`,
            isOvertime: elapsedMins > plannedDuration
        },
        chargingSession,
        chargingProgress
    });
});

module.exports = router;
