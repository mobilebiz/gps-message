/* 
 * VCR Location SMS Service
 * Implements Specification.md
 */

import { Vonage } from '@vonage/server-sdk';
import { vcr as vcrInstance } from '@vonage/vcr-sdk';
import express from 'express';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.VCR_PORT || 3000;

// Initialize VCR SDK and Vonage Server SDK
let vcr = vcrInstance;

// Basic check if we are in VCR environment (VCR_PORT is set)
// If not, use mock for local development
if (!process.env.VCR_PORT) {
    console.warn("VCR Environment not detected (using mock for local dev)");
    class MockState {
        constructor() { this.store = new Map(); }
        async get(key) { return this.store.get(key) || null; }
        async set(key, value) { this.store.set(key, value); return "OK"; }
        async delete(key) { this.store.delete(key); return "OK"; }
    }
    const mockState = new MockState();
    vcr = {
        getInstanceState: () => mockState
    };
}

const vonage = new Vonage({
    apiKey: process.env.VONAGE_API_KEY || "dummy_key",
    apiSecret: process.env.VONAGE_API_SECRET || "dummy_secret"
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// VCR State Helpers (using Instance State)
const USER_INDEX_KEY = 'user_index';

async function getState(key) {
    try {
        const state = vcr.getInstanceState();
        return await state.get(key);
    } catch (e) {
        console.error(`Error getting state for ${key}:`, e);
        return null;
    }
}

async function setState(key, value) {
    try {
        const state = vcr.getInstanceState();
        await state.set(key, value);
    } catch (e) {
        console.error(`Error setting state for ${key}:`, e);
    }
}

// Helper: Haversine
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    var R = 6371 * 1000; // Radius of the earth in m
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat1)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in m
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Routes

// Health Check
app.get(['/_health', '/_/health', '/health'], (req, res) => {
    res.status(200).send('OK');
});

// Webhook
app.post('/webhook/location', async (req, res) => {
    try {
        const { url, record } = req.body;
        console.log("Webhook Received:", JSON.stringify(req.body));

        if (!url || !record) {
            console.error("Invalid Payload: Missing url or record");
            return res.status(400).send("Invalid Payload");
        }

        // 1. Extract Subdomain
        const match = url.match(/https:\/\/([^.]+)\.cybozu\.com/);
        const subdomain = match ? match[1] : null;

        if (!subdomain) {
            console.error("Subdomain extraction failed for URL:", url);
            return res.status(400).send("Could not extract subdomain");
        }
        console.log(`Extracted Subdomain: ${subdomain}`);

        // 2. Load User Config
        const configKey = `user:${subdomain}`;
        const userConfig = await getState(configKey);

        if (!userConfig || !userConfig.phoneNumber || !userConfig.isActive) {
            console.log(`User config not found or inactive for ${subdomain}. Config:`, userConfig);
            return res.status(200).send("User not configured or inactive");
        }

        // 3. Cooldown Check
        const cooldownKey = `state:${subdomain}:last_sent`;
        const lastSent = await getState(cooldownKey);
        const now = Date.now();
        const cooldownMin = parseInt(process.env.COOLDOWN_MIN || "60");
        const cooldownMs = cooldownMin * 60 * 1000;

        if (lastSent && (now - lastSent < cooldownMs)) {
            const timeLeft = Math.ceil((cooldownMs - (now - lastSent)) / 60000);
            console.log(`Cooldown active for ${subdomain}. Last sent: ${new Date(lastSent).toISOString()}. Connect again in ${timeLeft} min.`);
            return res.status(200).send(`Cooldown active (${timeLeft} min remaining)`);
        }

        // 4. Geofencing
        const currentLat = parseFloat(record.lat.value);
        const currentLon = parseFloat(record.lon.value);
        const targetLat = parseFloat(process.env.TARGET_LAT || "35.681236");
        const targetLon = parseFloat(process.env.TARGET_LON || "139.767125");
        const radius = parseFloat(process.env.RADIUS || "100");

        const dist = getDistanceFromLatLonInM(currentLat, currentLon, targetLat, targetLon);
        console.log(`Distance: ${dist.toFixed(2)}m (Radius: ${radius}m)`);

        if (dist <= radius) {
            // 5. Send SMS
            console.log(`Sending SMS to ${userConfig.phoneNumber}`);

            // Check if we are in VCR environment (VCR_PORT is set)
            if (process.env.VCR_PORT) {
                try {
                    await vonage.sms.send({
                        to: userConfig.phoneNumber,
                        from: process.env.VONAGE_FROM || "VONAGE_SMS",
                        text: process.env.MESSAGE_BODY || "Entered GeoFence"
                    });
                    console.log("SMS Sent Successfully via Vonage API");
                } catch (smsError) {
                    console.error("Failed to send SMS:", smsError);
                    // Even if SMS fails, we update state to prevent spamming retry loops in short time
                    // return res.status(500).send("SMS Sending Failed");
                }
            } else {
                console.log(`[MOCK] SMS Sent: "${process.env.MESSAGE_BODY}" to ${userConfig.phoneNumber}`);
            }

            // Update State
            await setState(cooldownKey, now);
            return res.status(200).send("SMS Sent");
        } else {
            console.log("Outside Geofence");
            return res.status(200).send("Outside Geofence");
        }

    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).send("Internal Server Error");
    }
});

// API Endpoints

// Get All Users
app.get('/api/users', async (req, res) => {
    try {
        const userIndex = await getState(USER_INDEX_KEY) || [];
        const users = [];

        for (const subdomain of userIndex) {
            const user = await getState(`user:${subdomain}`);
            if (user) {
                users.push(user); // user object contains { subdomain, phoneNumber, isActive }
            }
        }
        res.json(users);
    } catch (e) {
        console.error("API Error (Get Users):", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Add User
app.post('/api/users', async (req, res) => {
    try {
        const { subdomain, phoneNumber, isActive } = req.body;
        console.log("API Add User:", req.body);

        if (!subdomain || !phoneNumber) {
            return res.status(400).json({ error: 'Subdomain and phone number are required' });
        }

        const userData = {
            subdomain,
            phoneNumber,
            isActive: !!isActive // Ensure boolean
        };

        // Save User Data
        await setState(`user:${subdomain}`, userData);

        // Update Index
        let userIndex = await getState(USER_INDEX_KEY) || [];
        if (!userIndex.includes(subdomain)) {
            userIndex.push(subdomain);
            await setState(USER_INDEX_KEY, userIndex);
        }

        res.status(201).json(userData);
    } catch (e) {
        console.error("API Error (Add User):", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Delete User
app.delete('/api/users/:subdomain', async (req, res) => {
    try {
        const { subdomain } = req.params;
        console.log("API Delete User:", subdomain);

        // Remove from Index
        let userIndex = await getState(USER_INDEX_KEY) || [];
        const newIndex = userIndex.filter(d => d !== subdomain);
        await setState(USER_INDEX_KEY, newIndex);

        // Remove User Config (Optional cleanup)
        // VCR Instance State (Redis-like) might support delete if we expose it
        // Or we just leave it orphan, or set to null.
        // Attempting to delete using delete() method if available on our mock or SDK wrapper logic
        // But setState implementation uses set().
        // Checked SDK types: State has delete(key).
        try {
            await vcr.getInstanceState().delete(`user:${subdomain}`);
        } catch (e) {
            // Fallback if delete not supported or fails
            await setState(`user:${subdomain}`, null);
        }

        res.sendStatus(200);
    } catch (e) {
        console.error("API Error (Delete User):", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Start Server
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    app.listen(port, () => {
        console.log(`VCR App listening on port ${port}`);
        console.log(`Admin UI available at http://localhost:${port}/`);
    });
}

export { app };
