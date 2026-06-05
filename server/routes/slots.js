/**
 * ParkEV - Parking Slot Routes
 * GET /api/slots, POST /api/slots/:id/book, POST /api/slots/:id/release
 * GET /api/slots/camera — Camera feed data + auto-detection simulation
 * GET /api/slots/occupancy — Full occupancy details for monitor
 * POST /api/slots/camera/simulate — Toggle camera simulation on/off
 */

const express = require('express');
const router = express.Router();
const mockData = require('../models/mockData');
const { addActivity } = require('../models/mockData');
const { EV_TEMP_CONFIG } = require('../models/mockData');
const { authenticate } = require('../middleware/auth');

// ============================================================
// ⚡ EV BATTERY SAFETY MONITOR ENGINE
// Tracks temperature of every active EV charging session.
// Triggers auto power cut-off if temp exceeds critical level.
// ============================================================
function runBatterySafetyCheck() {
    const now = new Date().toISOString();
    const activeSessions = mockData.chargingSessions.filter(s => s.chargingStatus === 'charging');

    for (const session of activeSessions) {
        // Initialize temp if first tick
        if (session.batteryTemp === undefined) {
            session.batteryTemp = EV_TEMP_CONFIG.BASE_TEMP;
            session.batteryHealth = 'NORMAL';
            session.powerCutOff = false;
        }

        if (session.powerCutOff) {
            // Cool down after cut-off
            session.batteryTemp = Math.max(
                EV_TEMP_CONFIG.BASE_TEMP,
                +(session.batteryTemp - EV_TEMP_CONFIG.COOL_RATE).toFixed(1)
            );
            continue;
        }

        // Simulate temperature rise (slight random variation)
        const rise = EV_TEMP_CONFIG.RISE_RATE + (Math.random() * 0.3 - 0.1);
        session.batteryTemp = +(session.batteryTemp + rise).toFixed(1);

        // Update health status
        if (session.batteryTemp <= EV_TEMP_CONFIG.NORMAL_MAX) {
            session.batteryHealth = 'NORMAL';
        } else if (session.batteryTemp <= EV_TEMP_CONFIG.WARNING_MAX) {
            session.batteryHealth = 'WARNING';
            // Log warning once per threshold crossing
            if (!session._warnLogged) {
                session._warnLogged = true;
                const slot = mockData.slots.find(s => s.slotId === session.slotId);
                addActivity('ev_warning',
                    `⚠️ High battery temp (${session.batteryTemp}°C) on Slot #${slot ? slot.slotNumber : '?'} — monitoring closely`,
                    'Safety Monitor', 'System');
                addDetectionEvent('system', 'BATT_WARNING',
                    `Slot #${slot ? slot.slotNumber : '?'}: Battery temp ${session.batteryTemp}°C — WARNING threshold crossed`);
            }
        } else if (session.batteryTemp > EV_TEMP_CONFIG.CRITICAL_MAX) {
            // === AUTO POWER CUT-OFF ===
            session.batteryHealth = 'CRITICAL';
            session.powerCutOff = true;
            session.cutOffAt = now;

            const slot = mockData.slots.find(s => s.slotId === session.slotId);
            if (slot) {
                slot.status = 'maintenance';
                slot.occupiedBy = null;
                slot.occupiedAt = null;
            }

            // Log critical safety event
            const alert = {
                alertId: 'alert-' + Date.now(),
                slotId: session.slotId,
                slotNumber: slot ? slot.slotNumber : '?',
                sessionId: session.sessionId,
                temperature: session.batteryTemp,
                triggeredAt: now,
                resolved: false
            };
            mockData.evSafetyAlerts.unshift(alert);
            if (mockData.evSafetyAlerts.length > 20) mockData.evSafetyAlerts.pop();

            addActivity('ev_cutoff',
                `🔴 AUTO POWER CUT-OFF: Slot #${slot ? slot.slotNumber : '?'} — Temp ${session.batteryTemp}°C exceeded ${EV_TEMP_CONFIG.CRITICAL_MAX}°C. Charging stopped. Slot set to maintenance.`,
                'Safety Monitor', 'System');
            addDetectionEvent('system', 'OVERHEAT_CUTOFF',
                `⚡ SAFETY: Slot #${slot ? slot.slotNumber : '?'} power cut-off — ${session.batteryTemp}°C`);

            console.log(`🔴 EV SAFETY: Auto cut-off triggered on slot ${slot ? slot.slotNumber : '?'} at ${session.batteryTemp}°C`);
        }
    }
}

// Run battery safety check every 6 seconds
setInterval(runBatterySafetyCheck, 6000);

// ============================================================
// Camera Simulation Engine
// Automatically occupies/releases random slots to simulate
// real IoT camera detecting vehicles entering and exiting
// ============================================================
let simulationInterval = null;
let simulationRunning = false;

// Per-user slot check cooldown map (userId -> timestamp) to throttle activity log
const slotCheckCooldown = {};

// Detection log — stores all camera events
const detectionLog = [];
const MAX_LOG_SIZE = 50;

function addDetectionEvent(cameraId, event, detail) {
    const entry = {
        timestamp: new Date().toISOString(),
        cameraId,
        event,
        detail
    };
    detectionLog.unshift(entry);
    if (detectionLog.length > MAX_LOG_SIZE) detectionLog.pop();
    return entry;
}

// Simulated vehicle database for auto-detections
const simulatedVehicles = [
    { name: 'Rahul Sharma', phone: '+91 98765 43201', email: 'rahul.s@email.com', vehicleNumber: 'KA 01 AB 1234', vehicleType: 'Petrol' },
    { name: 'Priya Nair', phone: '+91 87654 32109', email: 'priya.n@email.com', vehicleNumber: 'KA 02 CD 5678', vehicleType: 'Diesel' },
    { name: 'Amit Patel', phone: '+91 76543 21098', email: 'amit.p@email.com', vehicleNumber: 'MH 12 EF 9012', vehicleType: 'EV' },
    { name: 'Sneha Reddy', phone: '+91 65432 10987', email: 'sneha.r@email.com', vehicleNumber: 'TN 09 GH 3456', vehicleType: 'EV' },
    { name: 'Vikram Singh', phone: '+91 54321 09876', email: 'vikram.s@email.com', vehicleNumber: 'DL 03 IJ 7890', vehicleType: 'Petrol' },
    { name: 'Ananya Gupta', phone: '+91 43210 98765', email: 'ananya.g@email.com', vehicleNumber: 'GJ 05 KL 2345', vehicleType: 'Diesel' },
    { name: 'Karthik Menon', phone: '+91 32109 87654', email: 'karthik.m@email.com', vehicleNumber: 'AP 07 MN 6789', vehicleType: 'EV' },
    { name: 'Deepika Joshi', phone: '+91 21098 76543', email: 'deepika.j@email.com', vehicleNumber: 'RJ 14 OP 0123', vehicleType: 'Petrol' },
    { name: 'Suresh Kumar', phone: '+91 10987 65432', email: 'suresh.k@email.com', vehicleNumber: 'UP 32 QR 4567', vehicleType: 'Diesel' },
    { name: 'Meera Iyer', phone: '+91 09876 54321', email: 'meera.i@email.com', vehicleNumber: 'KL 11 ST 8901', vehicleType: 'EV' },
];

function runSimulationTick() {
    const now = new Date().toISOString();

    // 60% chance of an event happening each tick
    if (Math.random() > 0.6) return;

    const vacantSlots = mockData.slots.filter(s => s.status === 'vacant');
    const occupiedSlots = mockData.slots.filter(s => s.status === 'occupied' && s.occupiedBy && s.occupiedBy.startsWith('sim-'));

    // Decide: entry or exit (prefer entry when mostly empty, prefer exit when mostly full)
    const occupancyRatio = (mockData.slots.length - vacantSlots.length) / mockData.slots.length;
    const shouldEnter = Math.random() > occupancyRatio;

    if (shouldEnter && vacantSlots.length > 0) {
        // === VEHICLE ENTRY (camera detects new vehicle) ===
        const randomSlot = vacantSlots[Math.floor(Math.random() * vacantSlots.length)];
        const randomVehicle = simulatedVehicles[Math.floor(Math.random() * simulatedVehicles.length)];

        // EV slots only for EV vehicles
        if (randomSlot.type === 'ev' && randomVehicle.vehicleType !== 'EV') {
            // Try to find an EV vehicle for this slot
            const evVehicle = simulatedVehicles.filter(v => v.vehicleType === 'EV');
            if (evVehicle.length === 0) return;
            Object.assign(randomVehicle, evVehicle[Math.floor(Math.random() * evVehicle.length)]);
        }

        // Regular slots can take any vehicle type
        const simUserId = 'sim-' + Date.now();

        // Occupy the slot
        randomSlot.status = 'occupied';
        randomSlot.occupiedBy = simUserId;
        randomSlot.occupiedAt = now;

        // Store the simulated occupant data directly on the slot
        randomSlot._simOccupant = { ...randomVehicle, simUserId };

        // Update entrance camera
        const entranceCam = mockData.cameraFeeds.find(c => c.location.includes('Entrance'));
        if (entranceCam) {
            entranceCam.lastDetection = now;
            entranceCam.vehicleCount++;
        }

        // Update parking area camera
        const areaCam = mockData.cameraFeeds.find(c => c.location.includes('Parking Area'));
        if (areaCam) {
            areaCam.lastDetection = now;
            areaCam.vehicleCount = mockData.slots.filter(s => s.status === 'occupied').length;
        }

        // Create booking record
        const booking = {
            bookingId: 'bk-sim-' + Date.now(),
            userId: simUserId,
            slotId: randomSlot.slotId,
            startTime: now,
            endTime: null,
            status: 'active',
            vehicleNumber: randomVehicle.vehicleNumber,
            amount: randomSlot.type === 'ev' ? 25.00 : 15.00,
            createdAt: now,
            userName: randomVehicle.name,
            slotNumber: randomSlot.slotNumber,
            slotType: randomSlot.type
        };
        mockData.bookings.push(booking);

        // If EV, create charging session
        if (randomSlot.type === 'ev') {
            mockData.chargingSessions.push({
                sessionId: 'cs-sim-' + Date.now(),
                bookingId: booking.bookingId,
                slotId: randomSlot.slotId,
                userId: simUserId,
                loadTier: randomSlot.evLoadTier,
                energyDelivered: 0,
                chargingStatus: 'charging',
                startedAt: now,
                completedAt: null
            });
        }

        addDetectionEvent(
            entranceCam ? entranceCam.cameraId : 'cam-01',
            'VEHICLE_ENTRY',
            `${randomVehicle.vehicleNumber} (${randomVehicle.name}) entered → Slot #${randomSlot.slotNumber} [${randomSlot.type === 'ev' ? 'EV ' + randomSlot.evPower : 'Regular'}]`
        );

    } else if (!shouldEnter && occupiedSlots.length > 0) {
        // === VEHICLE EXIT (camera detects vehicle leaving) ===
        const randomSlot = occupiedSlots[Math.floor(Math.random() * occupiedSlots.length)];
        const vehicleInfo = randomSlot._simOccupant;

        // Release the slot
        randomSlot.status = 'vacant';
        const exitedBy = randomSlot.occupiedBy;
        randomSlot.occupiedBy = null;
        randomSlot.occupiedAt = null;
        delete randomSlot._simOccupant;

        // Update entrance camera
        const entranceCam = mockData.cameraFeeds.find(c => c.location.includes('Entrance'));
        if (entranceCam) {
            entranceCam.lastDetection = now;
            entranceCam.vehicleCount = Math.max(0, entranceCam.vehicleCount - 1);
        }

        // Update parking area camera
        const areaCam = mockData.cameraFeeds.find(c => c.location.includes('Parking Area'));
        if (areaCam) {
            areaCam.vehicleCount = mockData.slots.filter(s => s.status === 'occupied').length;
        }

        // Exit camera (reuse entrance or fall back)
        const exitCam = mockData.cameraFeeds.find(c => c.location.includes('Exit')) ||
                        mockData.cameraFeeds.find(c => c.location.includes('Entrance'));
        if (exitCam) {
            exitCam.lastDetection = now;
        }

        // Complete the booking
        const activeBooking = mockData.bookings.find(b =>
            b.userId === exitedBy && b.status === 'active'
        );
        if (activeBooking) {
            activeBooking.status = 'completed';
            activeBooking.endTime = now;
        }

        // Complete charging session if EV
        if (randomSlot.type === 'ev') {
            const session = mockData.chargingSessions.find(s =>
                s.userId === exitedBy && s.chargingStatus === 'charging'
            );
            if (session) {
                session.chargingStatus = 'completed';
                session.completedAt = now;
                session.energyDelivered = +(Math.random() * 20 + 2).toFixed(1);
            }
        }

        addDetectionEvent(
            exitCam ? exitCam.cameraId : 'cam-04',
            'VEHICLE_EXIT',
            `${vehicleInfo ? vehicleInfo.vehicleNumber + ' (' + vehicleInfo.name + ')' : 'Vehicle'} exited from Slot #${randomSlot.slotNumber}`
        );
    }
}

function startSimulation() {
    if (simulationRunning) return;
    simulationRunning = true;
    addDetectionEvent('system', 'SIM_START', 'Camera simulation engine started — auto-detecting vehicles');
    simulationInterval = setInterval(runSimulationTick, 4000); // tick every 4 seconds
    console.log('📹 Camera simulation engine started');
}

function stopSimulation() {
    if (!simulationRunning) return;
    simulationRunning = false;
    clearInterval(simulationInterval);
    simulationInterval = null;
    addDetectionEvent('system', 'SIM_STOP', 'Camera simulation engine stopped');
    console.log('📹 Camera simulation engine stopped');
}

// ============================================================
// ROUTES
// ============================================================
const fs = require('fs');

/**
 * GET /api/slots
 * Returns all slots along with current status and calculated map typography
 */
router.get('/', (req, res) => {
    const slotsWithInfo = mockData.slots.map(slot => {
        const result = { ...slot };

        // If occupied, include occupant info
        if (slot.occupiedBy) {
            // Check if it's a real user first
            const occupant = mockData.users.find(u => u.userId === slot.occupiedBy);
            if (occupant) {
                result.occupantName = occupant.name;
                result.occupantVehicle = occupant.vehicleNumber;
                result.occupantVehicleType = occupant.vehicleType;
                result.occupantEmail = occupant.email;
                result.occupantPhone = occupant.phone;
            }
            // If it's a simulated occupant
            else if (slot._simOccupant) {
                result.occupantName = slot._simOccupant.name;
                result.occupantVehicle = slot._simOccupant.vehicleNumber;
                result.occupantVehicleType = slot._simOccupant.vehicleType;
                result.occupantEmail = slot._simOccupant.email;
                result.occupantPhone = slot._simOccupant.phone;
            }
        }
        delete result._simOccupant;
        return result;
    });

    try {
        const path = require('path');
        const slotsPath = path.join(__dirname, '..', 'parking_slots.json');
        if (fs.existsSync(slotsPath)) {
            const polygonData = JSON.parse(fs.readFileSync(slotsPath, 'utf8'));
            const BASE_W = 3840;
            const BASE_H = 2160;

            for (let i = 0; i < slotsWithInfo.length && i < polygonData.length; i++) {
                const poly = polygonData[i];
                let sumX = 0, sumY = 0;
                poly.forEach(pt => { sumX += pt[0]; sumY += pt[1]; });
                const cx = sumX / poly.length;
                const cy = sumY / poly.length;
                
                slotsWithInfo[i].uiLeft = (cx / BASE_W) * 100;
                slotsWithInfo[i].uiTop = (cy / BASE_H) * 100;
            }
        }
    } catch (err) {
        console.error('Failed to map visual topology coordinates:', err.message);
    }

    const stats = {
        total: slotsWithInfo.length,
        vacant: slotsWithInfo.filter(s => s.status === 'vacant').length,
        occupied: slotsWithInfo.filter(s => s.status === 'occupied').length,
        maintenance: slotsWithInfo.filter(s => s.status === 'maintenance').length,
        evTotal: slotsWithInfo.filter(s => s.type === 'ev').length,
        evOccupied: slotsWithInfo.filter(s => s.type === 'ev' && s.status === 'occupied').length,
        evVacant: slotsWithInfo.filter(s => s.type === 'ev' && s.status === 'vacant').length,
        regularTotal: slotsWithInfo.filter(s => s.type === 'regular').length,
        regularOccupied: slotsWithInfo.filter(s => s.type === 'regular' && s.status === 'occupied').length,
        regularVacant: slotsWithInfo.filter(s => s.type === 'regular' && s.status === 'vacant').length
    };

    // Log slot availability check — throttled per user (once every 30s to avoid poll flooding)
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const jwt = require('jsonwebtoken');
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const now = Date.now();
            const lastCheck = slotCheckCooldown[decoded.userId] || 0;
            if (now - lastCheck > 30000) { // only log once per 30 seconds per user
                slotCheckCooldown[decoded.userId] = now;
                addActivity('slot_check', `${decoded.name} checked slot availability (${stats.vacant} vacant / ${stats.total} total)`, decoded.name, decoded.affiliation);
            }
        } catch (e) { /* ignore invalid tokens for logging */ }
    }

    res.json({ slots: slotsWithInfo, stats });
});

/**
 * GET /api/slots/ev-safety
 * Returns live battery temperature, health status, and safety alerts for all active EV sessions
 */
router.get('/ev-safety', (req, res) => {
    const evSlots = mockData.slots.filter(s => s.type === 'ev');
    const activeSessions = mockData.chargingSessions.filter(s => s.chargingStatus === 'charging');

    const liveStatus = evSlots.map(slot => {
        let session = activeSessions.find(s => s.slotId === slot.slotId);

        // If slot is occupied but no charging session exists yet, synthesise one
        if (!session && slot.status === 'occupied') {
            session = {
                sessionId: null,
                slotId: slot.slotId,
                batteryTemp: EV_TEMP_CONFIG.BASE_TEMP,
                batteryHealth: 'NORMAL',
                powerCutOff: false,
                cutOffAt: null,
                chargingStatus: 'charging'
            };
            // Push a real session so the safety monitor can track it going forward
            const synth = {
                sessionId: 'cs-auto-' + Date.now() + '-' + slot.slotId,
                bookingId: null,
                slotId: slot.slotId,
                userId: slot.occupiedBy,
                loadTier: slot.evLoadTier,
                energyDelivered: 0,
                chargingStatus: 'charging',
                startedAt: slot.occupiedAt || new Date().toISOString(),
                completedAt: null,
                batteryTemp: EV_TEMP_CONFIG.BASE_TEMP,
                batteryHealth: 'NORMAL',
                powerCutOff: false
            };
            mockData.chargingSessions.push(synth);
            session = synth;
        }

        return {
            slotId: slot.slotId,
            slotNumber: slot.slotNumber,
            status: slot.status,
            evPower: slot.evPower,
            charging: !!session,
            batteryTemp: session ? session.batteryTemp : null,
            batteryHealth: session ? session.batteryHealth : 'IDLE',
            powerCutOff: session ? session.powerCutOff : false,
            cutOffAt: session ? session.cutOffAt : null,
            sessionId: session ? session.sessionId : null,
            occupantName: slot.occupantName || null
        };
    });

    res.json({
        liveStatus,
        alerts: mockData.evSafetyAlerts.slice(0, 10),
        thresholds: EV_TEMP_CONFIG,
        totalActiveSessions: activeSessions.length,
        cutoffCount: mockData.evSafetyAlerts.filter(a => !a.resolved).length
    });
});

/**
 * POST /api/slots/ev-safety/:alertId/resolve
 * Admin resolves a safety alert and restores the slot to vacant
 */
router.post('/ev-safety/:alertId/resolve', authenticate, (req, res) => {
    const { alertId } = req.params;
    const alert = mockData.evSafetyAlerts.find(a => a.alertId === alertId);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    alert.resolved = true;
    alert.resolvedAt = new Date().toISOString();

    // Restore slot to vacant
    const slot = mockData.slots.find(s => s.slotId === alert.slotId);
    if (slot && slot.status === 'maintenance') {
        slot.status = 'vacant';
        slot.occupiedBy = null;
    }

    // End the session
    const session = mockData.chargingSessions.find(s => s.sessionId === alert.sessionId);
    if (session) {
        session.chargingStatus = 'completed';
        session.completedAt = new Date().toISOString();
    }

    addActivity('ev_resolved',
        `✅ Safety alert resolved for Slot #${alert.slotNumber} — slot restored to VACANT`,
        req.user?.name || 'Admin', 'Admin');

    res.json({ message: `Alert resolved. Slot #${alert.slotNumber} restored to vacant.` });
});

/**
 * GET /api/slots/camera
 * Returns camera feed data, detection log, and simulation status
 */
router.get('/camera', (req, res) => {
    const cameras = mockData.cameraFeeds.map(cam => {
        const zoneSlots = cam.location.includes('Zone A')
            ? mockData.slots.filter(s => s.zone === 'A')
            : cam.location.includes('Zone B')
                ? mockData.slots.filter(s => s.zone === 'B')
                : null;

        const liveCount = zoneSlots
            ? zoneSlots.filter(s => s.status === 'occupied').length
            : (cam.location.includes('Entrance')
                ? mockData.slots.filter(s => s.status === 'occupied').length
                : 0);

        return {
            ...cam,
            vehicleCount: liveCount,
            lastChecked: new Date().toISOString()
        };
    });

    // Build real-time snapshot
    const snapshot = {
        timestamp: new Date().toISOString(),
        simulationActive: simulationRunning,
        cameras,
        detectionLog: detectionLog.slice(0, 20),
        parkingOverview: {
            totalSlots: mockData.slots.length,
            occupied: mockData.slots.filter(s => s.status === 'occupied').length,
            vacant: mockData.slots.filter(s => s.status === 'vacant').length,
            maintenance: mockData.slots.filter(s => s.status === 'maintenance').length,
            zoneA: {
                total: mockData.slots.filter(s => s.zone === 'A').length,
                occupied: mockData.slots.filter(s => s.zone === 'A' && s.status === 'occupied').length
            },
            zoneB: {
                total: mockData.slots.filter(s => s.zone === 'B').length,
                occupied: mockData.slots.filter(s => s.zone === 'B' && s.status === 'occupied').length
            }
        }
    };

    res.json(snapshot);
});

/**
 * POST /api/slots/camera/simulate
 * Toggle the camera simulation on/off
 */
router.post('/camera/simulate', (req, res) => {
    const { action } = req.body;

    if (action === 'start') {
        startSimulation();
        res.json({ message: 'Camera simulation started', active: true });
    } else if (action === 'stop') {
        stopSimulation();
        res.json({ message: 'Camera simulation stopped', active: false });
    } else if (action === 'toggle') {
        if (simulationRunning) {
            stopSimulation();
            res.json({ message: 'Camera simulation stopped', active: false });
        } else {
            startSimulation();
            res.json({ message: 'Camera simulation started', active: true });
        }
    } else {
        res.json({ active: simulationRunning });
    }
});

/**
 * GET /api/slots/occupancy
 * Returns full occupancy details — who is in each slot with their complete info
 */
router.get('/occupancy', (req, res) => {
    const occupancyDetails = mockData.slots.map(slot => {
        const entry = {
            slotId: slot.slotId,
            slotNumber: slot.slotNumber,
            type: slot.type,
            zone: slot.zone,
            status: slot.status,
            evLoadTier: slot.evLoadTier || null,
            evPower: slot.evPower || null,
            evLevel: slot.evLevel || null,
            occupiedAt: slot.occupiedAt,
            occupant: null,
            booking: null,
            chargingSession: null,
            duration: null
        };

        if (slot.status === 'occupied' && slot.occupiedBy) {
            // Get occupant info — real user or simulated
            const realUser = mockData.users.find(u => u.userId === slot.occupiedBy);
            if (realUser) {
                entry.occupant = {
                    name: realUser.name,
                    email: realUser.email,
                    phone: realUser.phone,
                    vehicleNumber: realUser.vehicleNumber,
                    vehicleType: realUser.vehicleType,
                    evChargingCapacity: realUser.evChargingCapacity || null
                };
            } else if (slot._simOccupant) {
                entry.occupant = {
                    name: slot._simOccupant.name,
                    email: slot._simOccupant.email,
                    phone: slot._simOccupant.phone,
                    vehicleNumber: slot._simOccupant.vehicleNumber,
                    vehicleType: slot._simOccupant.vehicleType,
                    evChargingCapacity: null,
                    isSimulated: true
                };
            }

            // Active booking for this slot
            const activeBooking = mockData.bookings.find(b =>
                b.slotId === slot.slotId && b.status === 'active'
            );
            if (activeBooking) {
                entry.booking = {
                    bookingId: activeBooking.bookingId,
                    startTime: activeBooking.startTime,
                    amount: activeBooking.amount,
                    vehicleNumber: activeBooking.vehicleNumber
                };
            }

            // Active charging session (EV only)
            if (slot.type === 'ev') {
                const session = mockData.chargingSessions.find(s =>
                    s.slotId === slot.slotId && s.chargingStatus === 'charging'
                );
                if (session) {
                    entry.chargingSession = {
                        sessionId: session.sessionId,
                        loadTier: session.loadTier,
                        energyDelivered: session.energyDelivered,
                        startedAt: session.startedAt
                    };
                }
            }

            // Calculate duration
            if (slot.occupiedAt) {
                const mins = Math.floor((Date.now() - new Date(slot.occupiedAt).getTime()) / 60000);
                entry.duration = {
                    minutes: mins,
                    display: mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
                };
            }
        }

        return entry;
    });

    // Summary stats
    const summary = {
        totalSlots: mockData.slots.length,
        totalOccupied: occupancyDetails.filter(s => s.status === 'occupied').length,
        totalVacant: occupancyDetails.filter(s => s.status === 'vacant').length,
        totalMaintenance: occupancyDetails.filter(s => s.status === 'maintenance').length,
        zoneA: {
            total: occupancyDetails.filter(s => s.zone === 'A').length,
            occupied: occupancyDetails.filter(s => s.zone === 'A' && s.status === 'occupied').length
        },
        zoneB: {
            total: occupancyDetails.filter(s => s.zone === 'B').length,
            occupied: occupancyDetails.filter(s => s.zone === 'B' && s.status === 'occupied').length
        },
        activeChargingSessions: mockData.chargingSessions.filter(s => s.chargingStatus === 'charging').length,
        timestamp: new Date().toISOString()
    };

    res.json({
        occupancy: occupancyDetails,
        summary
    });
});

// ============================================================
// EV Charging Time Calculator
// Estimates how long to charge from currentPct to 100%
// Formula: timeHours = (batteryCapacityKwh * (100 - pct) / 100) / chargerKw
// With efficiency factor of 0.9 and tapering above 80%
// ============================================================
function calculateChargingTime(chargerPowerKw, batteryCapacityKwh, currentPct) {
    if (currentPct >= 100) return { totalMinutes: 0, estimatedKwh: 0 };
    const chargerKw = parseFloat(chargerPowerKw) || 7.4;
    const batteryKwh = parseFloat(batteryCapacityKwh) || 40;
    const pct = Math.max(0, Math.min(99, currentPct));
    const efficiency = 0.9; // 90% charging efficiency

    // Energy needed in kWh
    const energyNeeded = batteryKwh * (100 - pct) / 100;

    // Base charging time  (with efficiency)
    let timeHours = energyNeeded / (chargerKw * efficiency);

    // Taper: charging slows above 80% (add 20% more time for 80-100%)
    if (pct < 80) {
        const energyTo80 = batteryKwh * (80 - pct) / 100;
        const energy80to100 = batteryKwh * 0.2;
        timeHours = (energyTo80 / (chargerKw * efficiency)) + (energy80to100 / (chargerKw * efficiency * 0.7));
    }

    return {
        totalMinutes: Math.ceil(timeHours * 60),
        estimatedKwh: +energyNeeded.toFixed(1),
        displayTime: timeHours >= 1
            ? `${Math.floor(timeHours)}h ${Math.ceil((timeHours % 1) * 60)}m`
            : `${Math.ceil(timeHours * 60)} min`
    };
}

/**
 * POST /api/slots/:id/book
 * Book a vacant slot (auth required)
 * Body: { plannedDuration, currentBatteryPct }
 */
router.post('/:id/book', authenticate, (req, res) => {
    const slotId = req.params.id;
    const userId = req.user.userId;
    const { duration, plannedDuration, currentBatteryPct } = req.body || {};

    const slot = mockData.slots.find(s => s.slotId === slotId);
    if (!slot) {
        return res.status(404).json({ error: 'Slot not found.' });
    }

    if (slot.status !== 'vacant') {
        return res.status(409).json({ error: 'Slot is not vacant.' });
    }

    // Check if user already has an active booking
    const existingBooking = mockData.bookings.find(b => b.userId === userId && b.status === 'active');
    if (existingBooking) {
        return res.status(409).json({ error: 'You already have an active booking. Release it first.' });
    }

    // If EV slot, verify user has EV
    const user = mockData.users.find(u => u.userId === userId);
    if (slot.type === 'ev' && user && user.vehicleType !== 'EV') {
        return res.status(400).json({ error: 'Only electric vehicles can book EV charging slots.' });
    }

    // If Faculty-Only slot, verify user affiliation
    if (slot.facultyOnly && user) {
        if (user.affiliation !== 'Faculty' && user.role !== 'admin') {
            return res.status(403).json({ error: 'Slots 1 & 2 are reserved for Faculty members only.' });
        }
    }

    // Book the slot
    const now = new Date().toISOString();
    slot.status = 'occupied';
    slot.occupiedBy = userId;
    slot.occupiedAt = now;

    // Determine the user's battery capacity
    const userBatteryKwh = user && user.evChargingCapacity
        ? parseFloat(user.evChargingCapacity) : 40;
    const chargerKw = slot.evPower ? parseFloat(slot.evPower) : 0;

    // Calculate EV charging estimate if applicable
    let chargingEstimate = null;
    if (slot.type === 'ev' && currentBatteryPct !== undefined) {
        chargingEstimate = calculateChargingTime(chargerKw, userBatteryKwh, currentBatteryPct);
    }

    // Create booking record
    const durationMins = parseInt(duration || plannedDuration) || 60;
    const booking = {
        bookingId: 'bk-' + String(mockData.bookings.length + 1).padStart(3, '0'),
        userId,
        slotId,
        startTime: now,
        endTime: null,
        plannedDuration: durationMins,
        plannedEndTime: new Date(Date.now() + durationMins * 60000).toISOString(),
        status: 'active',
        vehicleNumber: user ? user.vehicleNumber : 'N/A',
        amount: slot.type === 'ev' ? 25.00 : 15.00,
        createdAt: now
    };
    mockData.bookings.push(booking);

    // If EV slot, create charging session with battery tracking
    if (slot.type === 'ev') {
        const session = {
            sessionId: 'cs-' + String(mockData.chargingSessions.length + 1).padStart(3, '0'),
            bookingId: booking.bookingId,
            slotId,
            userId,
            loadTier: slot.evLoadTier,
            chargerKw,
            batteryCapacityKwh: userBatteryKwh,
            initialBatteryPct: parseInt(currentBatteryPct) || 0,
            targetBatteryPct: 100,
            estimatedChargeMinutes: chargingEstimate ? chargingEstimate.totalMinutes : null,
            estimatedKwh: chargingEstimate ? chargingEstimate.estimatedKwh : 0,
            energyDelivered: 0,
            chargingStatus: 'charging',
            startedAt: now,
            completedAt: null
        };
        mockData.chargingSessions.push(session);
    }

    // Update camera feed to reflect new detection
    const areaCam = mockData.cameraFeeds.find(c => c.location.includes('Parking Area'));
    if (areaCam) {
        areaCam.lastDetection = now;
        areaCam.vehicleCount = mockData.slots.filter(s => s.status === 'occupied').length;
    }

    // Add to detection log
    addDetectionEvent(
        'cam-01',
        'VEHICLE_ENTRY',
        `${user ? user.vehicleNumber : 'Vehicle'} (${user ? user.name : 'User'}) booked Slot #${slot.slotNumber}${chargingEstimate ? ' — Charging from ' + (parseInt(currentBatteryPct) || 0) + '% (~' + chargingEstimate.displayTime + ')' : ''}`
    );

    // Log activity
    addActivity('booking', `${user ? user.name : 'User'} booked Slot #${slot.slotNumber} (${slot.type === 'ev' ? 'EV' : 'Regular'}) for ${Math.round(durationMins/60)}h — ₹${booking.amount}`, user ? user.name : 'User', user ? user.affiliation : 'System');

    res.json({
        message: `Slot ${slot.slotNumber} booked successfully!`,
        booking,
        slot,
        chargingEstimate
    });
});

/**
 * POST /api/slots/:id/release
 * Release an occupied slot (auth required)
 */
router.post('/:id/release', authenticate, (req, res) => {
    const slotId = req.params.id;
    const userId = req.user.userId;

    const slot = mockData.slots.find(s => s.slotId === slotId);
    if (!slot) {
        return res.status(404).json({ error: 'Slot not found.' });
    }

    if (slot.status !== 'occupied') {
        return res.status(400).json({ error: 'Slot is not occupied.' });
    }

    // Only the occupant or admin can release
    if (slot.occupiedBy !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only release your own slot.' });
    }

    const now = new Date().toISOString();
    const user = mockData.users.find(u => u.userId === slot.occupiedBy);

    // Update slot
    slot.status = 'vacant';
    slot.occupiedBy = null;
    slot.occupiedAt = null;
    delete slot._simOccupant;

    // Complete booking
    const activeBooking = mockData.bookings.find(b =>
        b.slotId === slotId && b.status === 'active'
    );
    if (activeBooking) {
        activeBooking.status = 'completed';
        activeBooking.endTime = now;
    }

    // Complete charging session if EV
    if (slot.type === 'ev') {
        const activeSession = mockData.chargingSessions.find(s =>
            s.slotId === slotId && s.chargingStatus === 'charging'
        );
        if (activeSession) {
            activeSession.chargingStatus = 'completed';
            activeSession.completedAt = now;
        }
    }

    // Add to detection log
    addDetectionEvent(
        'cam-02',
        'VEHICLE_EXIT',
        `${user ? user.vehicleNumber : 'Vehicle'} released Slot #${slot.slotNumber}`
    );

    // Log activity
    addActivity('release', `${user ? user.name : 'User'} released Slot #${slot.slotNumber}`, user ? user.name : 'User', user ? user.affiliation : 'System');

    res.json({
        message: `Slot ${slot.slotNumber} released successfully!`,
        slot
    });
});

/**
 * POST /api/slots/vision-sync
 * Webhook for Python YOLOv8 engine to push real-time occupancy updates
 * Body: { occupancy: [true, false, true, ...] }
 */
router.post('/vision-sync', (req, res) => {
    const { occupancy } = req.body;
    
    if (!Array.isArray(occupancy)) {
        return res.status(400).json({ error: 'Invalid payload. Expected { occupancy: [] }' });
    }

    const now = new Date().toISOString();
    let changesCount = 0;

    // Hard-coded manual mapping for AI recognized slots
    const staticOccupants = {
        1: { name: 'Student 1', vehicleNumber: 'KA 01 AA 1111', vehicleType: 'Regular', role: 'Student' },
        2: { name: 'Student 2', vehicleNumber: 'KA 02 BB 2222', vehicleType: 'Regular', role: 'Student' },
        3: { name: 'Student 3', vehicleNumber: 'KA 03 CC 3333', vehicleType: 'Regular', role: 'Student' },
        7: { name: 'Student 7', vehicleNumber: 'TS 08 EV 8888', vehicleType: 'Regular', role: 'Student' },
        9: { name: 'Dr. Likhith', vehicleNumber: 'KA 01 AA 9999', vehicleType: 'Regular', role: 'Faculty' },
        10: { name: 'Prof. Sharma', vehicleNumber: 'KA 02 BB 1010', vehicleType: 'Regular', role: 'Faculty' },
        11: { name: 'Dr. Anita', vehicleNumber: 'KA 03 CC 1111', vehicleType: 'Regular', role: 'Faculty' },
        12: { name: 'Karthik EV', vehicleNumber: 'AP 07 EV 0001', vehicleType: 'EV', role: 'Student' },
        13: { name: 'Sneha EV', vehicleNumber: 'KA 01 EV 0002', vehicleType: 'EV', role: 'Faculty' }
    };

    // The Python script sends array elements representing the drawn slots
    for (let i = 0; i < occupancy.length; i++) {
        if (i >= mockData.slots.length) break;

        const slot = mockData.slots[i];
        const isOccupiedAI = occupancy[i];

        // Ensure we only transition state if there is an actual change
        const isCurrentlyOccupied = slot.status === 'occupied';

        if (isOccupiedAI && !isCurrentlyOccupied) {
            // Vehicle ENTERED
            const predefinedUser = staticOccupants[slot.slotNumber];

            slot.status = 'occupied';
            slot.occupiedBy = 'ai-vision';
            slot.occupiedAt = now;
            slot._simOccupant = predefinedUser ? {
                name: predefinedUser.name,
                phone: 'Verified',
                email: 'user' + slot.slotNumber + '@parkev.local',
                vehicleNumber: predefinedUser.vehicleNumber,
                vehicleType: predefinedUser.vehicleType,
                simUserId: 'ai-' + slot.slotNumber
            } : { 
                name: 'Unknown (AI Detected)', 
                phone: 'N/A', 
                email: 'N/A', 
                vehicleNumber: 'AI-DETECTED', 
                vehicleType: 'Regular', 
                simUserId: 'ai-vision' 
            };
            
            addDetectionEvent('cam-yolo', 'VEHICLE_ENTRY', `YOLOv8 AI detected vehicle parked in Slot #${slot.slotNumber}`);
            changesCount++;

        } else if (!isOccupiedAI && isCurrentlyOccupied && slot.occupiedBy === 'ai-vision') {
            // Vehicle LEFT (Only override if it was occupied by AI, not a legit human user)
            slot.status = 'vacant';
            slot.occupiedBy = null;
            slot.occupiedAt = null;
            delete slot._simOccupant;

            addDetectionEvent('cam-yolo', 'VEHICLE_EXIT', `YOLOv8 AI detected vehicle departed from Slot #${slot.slotNumber}`);
            changesCount++;
        }
    }

    // Ping area camera if changes occurred
    if (changesCount > 0) {
        const areaCam = mockData.cameraFeeds.find(c => c.location.includes('Parking Area'));
        if (areaCam) {
            areaCam.lastDetection = now;
            areaCam.vehicleCount = mockData.slots.filter(s => s.status === 'occupied').length;
        }
    }

    res.json({ message: 'Vision sync successful', updatedSlots: changesCount });
});

module.exports = router;
