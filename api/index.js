const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Import both models
const Principal = require('../models/Principal');
const Coordinator = require('../models/Coordinator');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Connection caching for Vercel performance
let isConnected = false;
const connectToDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(process.env.MONGO_URI);
        isConnected = true;
        console.log("✅ Placemate DB Connected");
    } catch (err) {
        console.log("❌ Connection Error:", err);
    }
};

// --- 1. PRINCIPAL ROUTES ---

app.post('/register', async (req, res) => {
    await connectToDB();
    try {
        const { name, email, password, phone, institution } = req.body;
        const exists = await Principal.findOne({ email });
        if (exists) return res.status(400).json({ error: "Principal already exists" });

        const newPrincipal = new Principal({ name, email, password, phone, institution });
        await newPrincipal.save();
        res.status(201).json({ message: "Principal registered successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/login', async (req, res) => {
    await connectToDB();
    try {
        const { email, password } = req.body;
        const principal = await Principal.findOne({ email });
        if (!principal || principal.password !== password) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        res.status(200).json({ message: "Login success", principal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 2. COORDINATOR ROUTES (Managed by Principal) ---

/**
 * NEW: Coordinator Login Route
 * This was missing! Point your Flutter Coordinator Login here.
 */
app.post('/coordinator/login', async (req, res) => {
    await connectToDB();
    try {
        const { email, password } = req.body;
        const coordinator = await Coordinator.findOne({ email });
        
        if (!coordinator || coordinator.password !== password) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        // Return the coordinator object containing _id
        res.status(200).json({ message: "Coordinator login success", coordinator });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new coordinator LINKED to a Principal
app.post('/add-coordinator', async (req, res) => {
    await connectToDB();
    try {
        const { name, email, dept, password, createdBy } = req.body;

        if (!createdBy) {
            return res.status(400).json({ error: "Principal ID (createdBy) is required" });
        }

        const exists = await Coordinator.findOne({ email });
        if (exists) return res.status(400).json({ error: "Coordinator already exists" });

        const newCoord = new Coordinator({ 
            name, 
            email, 
            dept, 
            password, 
            createdBy 
        });
        
        await newCoord.save();
        res.status(201).json(newCoord);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch only coordinators created by a SPECIFIC Principal
app.get('/coordinators/:principalId', async (req, res) => {
    await connectToDB();
    try {
        const { principalId } = req.params;
        const list = await Coordinator.find({ createdBy: principalId }).sort({ createdAt: -1 });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a coordinator
app.delete('/coordinator/:id', async (req, res) => {
    await connectToDB();
    try {
        await Coordinator.findByIdAndDelete(req.params.id);
        res.json({ message: "Coordinator deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.send("Placemate Unified API is Live!"));

module.exports = app;