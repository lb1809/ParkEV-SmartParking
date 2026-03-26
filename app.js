/**
 * CloudPark - Frontend Interactive Logic
 * Handles dynamic grid generation, simulated IoT updates, and UI interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const ZONE_A_CAPACITY = 10; // Standard spots
    const ZONE_B_CAPACITY = 8;  // EV spots
    const PRICE_PER_HOUR = 5.00;

    // --- DOM Elements ---
    const zoneAContainer = document.getElementById('zone-a');
    const zoneBContainer = document.getElementById('zone-b');
    const kpiAvailable = document.getElementById('kpi-available');
    const activityLog = document.getElementById('activity-log');
    const simulateBtn = document.getElementById('simulate-btn');

    // Reservation Widget Elements
    const durationSlider = document.getElementById('duration-slider');
    const durationDisplay = document.getElementById('duration-display');
    const priceDisplays = document.querySelectorAll('.price-text, #summary-price');
    const typeRadios = document.querySelectorAll('input[name="vehicle-type"]');

    // Modal Elements
    const openPaymentBtn = document.getElementById('open-payment-btn');
    const closePaymentBtn = document.querySelector('.close-modal');
    const paymentModal = document.getElementById('payment-modal');
    const confirmPaymentBtn = document.getElementById('confirm-payment-btn');
    const summaryType = document.getElementById('summary-type');
    const summaryDuration = document.getElementById('summary-duration');

    // --- State ---
    let parkingSpots = []; // Will store spot objects { id, type, status }

    // --- 1. Grid Generation ---
    function initGrid() {
        // Generate Zone A (Standard)
        for (let i = 1; i <= ZONE_A_CAPACITY; i++) {
            const id = `A${String(i).padStart(2, '0')}`;
            // 70% chance of being occupied
            const status = Math.random() > 0.3 ? 'occupied' : 'empty';
            parkingSpots.push({ id, type: 'standard', status });
            zoneAContainer.appendChild(createSpotElement(id, 'standard', status));
        }

        // Generate Zone B (EV)
        for (let i = 1; i <= ZONE_B_CAPACITY; i++) {
            const id = `B${String(i).padStart(2, '0')}`;
            // Random states for EV
            const rand = Math.random();
            let status = 'empty';
            if (rand > 0.6) status = 'ev-active'; // charging
            else if (rand > 0.3) status = 'occupied'; // non-charging / idle

            parkingSpots.push({ id, type: 'ev', status });
            zoneBContainer.appendChild(createSpotElement(id, 'ev', status));
        }

        updateKPIs();
    }

    function createSpotElement(id, type, status) {
        const div = document.createElement('div');
        div.className = `parking-spot spot-${status}`;
        div.id = `spot-${id}`;

        // Add specific icons based on status
        if (status === 'occupied') {
            div.innerHTML = `<i class="fa-solid fa-car-side car-icon"></i>`;
        } else if (status === 'ev-active') {
            div.innerHTML = `<i class="fa-solid fa-car-side car-icon"></i><div class="ev-icon-overlay"><i class="fa-solid fa-bolt"></i></div>`;
        }

        // ID Label
        const label = document.createElement('div');
        label.className = 'spot-id';
        label.innerText = id;
        div.appendChild(label);

        // Interaction (only empty spots are clickable for booking)
        div.addEventListener('click', () => {
            if (status === 'empty') {
                // Auto-select the corresponding type in the reservation widget
                document.getElementById(`type-${type}`).checked = true;

                // Visual feedback
                document.querySelectorAll('.parking-spot').forEach(s => s.style.boxShadow = 'none');
                div.style.boxShadow = `0 0 15px ${type === 'ev' ? 'var(--color-teal)' : 'var(--color-green)'}`;
            }
        });

        return div;
    }

    // --- 2. Interactive Logic ---
    function updatePrice() {
        const hours = parseInt(durationSlider.value);
        durationDisplay.innerText = hours;

        const isEv = document.getElementById('type-ev').checked;
        const total = (hours * PRICE_PER_HOUR) + (isEv ? 2.00 : 0); // EV surcharge

        priceDisplays.forEach(el => el.innerText = `$${total.toFixed(2)}`);

        // Update Modal details
        summaryDuration.innerText = `${hours} Hour${hours > 1 ? 's' : ''}`;
        summaryType.innerText = isEv ? 'EV Charging (Zone B)' : 'Standard (Zone A)';
        confirmPaymentBtn.innerHTML = `<i class="fa-solid fa-lock"></i> Pay $${total.toFixed(2)}`;
    }

    // Event Listeners for Reservation Widget
    durationSlider.addEventListener('input', updatePrice);
    typeRadios.forEach(radio => radio.addEventListener('change', updatePrice));

    // Modal behavior
    openPaymentBtn.addEventListener('click', () => {
        paymentModal.classList.add('active');
    });

    closePaymentBtn.addEventListener('click', () => {
        paymentModal.classList.remove('active');
    });

    // Close modal on outside click
    paymentModal.addEventListener('click', (e) => {
        if (e.target === paymentModal) paymentModal.classList.remove('active');
    });

    // Payment confirmation mock
    confirmPaymentBtn.addEventListener('click', () => {
        const originalText = confirmPaymentBtn.innerHTML;
        confirmPaymentBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...`;

        setTimeout(() => {
            confirmPaymentBtn.classList.remove('success-btn');
            confirmPaymentBtn.style.background = 'var(--text-primary)';
            confirmPaymentBtn.style.color = 'var(--bg-dark)';
            confirmPaymentBtn.innerHTML = `<i class="fa-solid fa-check-circle"></i> Payment Successful`;

            // Log activity
            addLog(`Payment received for ${document.getElementById('type-ev').checked ? 'EV' : 'Standard'} spot`);

            setTimeout(() => {
                paymentModal.classList.remove('active');
                // reset button
                setTimeout(() => {
                    confirmPaymentBtn.classList.add('success-btn');
                    updatePrice();
                }, 300);
            }, 1000);
        }, 1500);
    });

    // --- 3. IoT Simulation ---
    function updateKPIs() {
        const emptyCount = parkingSpots.filter(s => s.status === 'empty').length;
        kpiAvailable.innerText = emptyCount;

        // Add subtle animation to KPI
        kpiAvailable.style.transform = 'scale(1.2)';
        kpiAvailable.style.color = 'var(--color-green)';
        setTimeout(() => {
            kpiAvailable.style.transform = 'scale(1)';
            kpiAvailable.style.color = 'var(--text-primary)';
        }, 300);
    }

    function addLog(message) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const li = document.createElement('li');
        li.innerHTML = `<span class="time">${timeStr}</span> ${message}`;

        activityLog.insertBefore(li, activityLog.firstChild);

        // Keep list reasonable size
        if (activityLog.children.length > 8) {
            activityLog.removeChild(activityLog.lastChild);
        }
    }

    simulateBtn.addEventListener('click', () => {
        // Change button icon to spin
        const icon = simulateBtn.querySelector('i');
        icon.classList.remove('fa-satellite-dish');
        icon.classList.add('fa-rotate', 'fa-spin');

        // Simulate network delay
        setTimeout(() => {
            // Pick a random spot to change
            const randIndex = Math.floor(Math.random() * parkingSpots.length);
            const spotData = parkingSpots[randIndex];
            const domElement = document.getElementById(`spot-${spotData.id}`);

            if (spotData.status === 'empty') {
                // Car entered
                spotData.status = spotData.type === 'ev' ? 'ev-active' : 'occupied';
                addLog(`Vehicle entered ${spotData.id}`);
            } else {
                // Car left
                spotData.status = 'empty';
                addLog(`Vehicle exited ${spotData.id}`);
            }

            // Re-render that specific DOM element
            const newElement = createSpotElement(spotData.id, spotData.type, spotData.status);
            domElement.parentNode.replaceChild(newElement, domElement);

            // Update counts
            updateKPIs();

            // Reset button
            icon.classList.remove('fa-rotate', 'fa-spin');
            icon.classList.add('fa-satellite-dish');

        }, 800);
    });

    // --- Payment Method Selectors ---
    const payMethods = document.querySelectorAll('.pay-method-btn');
    payMethods.forEach(btn => {
        btn.addEventListener('click', () => {
            payMethods.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Initialize
    initGrid();
    updatePrice();
});
