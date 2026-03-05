const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const Principal = require('../models/Principal');

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection Logic for Serverless
// We use a variable to cache the connection so Vercel doesn't reconnect on every click
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

// --- THE REGISTRATION ROUTE ---
app.post('/register', async (req, res) => {
    await connectToDB(); // Ensure DB is connected before processing
    try {
        const { email, password } = req.body;
        
        // Check if user already exists
        const existingUser = await Principal.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "Principal already exists" });
        }

        const newPrincipal = new Principal({ email, password });
        await newPrincipal.save();
        res.status(201).json({ message: "Principal registered successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Root route for testing if deployment is live
app.get('/', (req, res) => {
    res.send("Placemate Backend is running on Vercel!");
});

// IMPORTANT FOR VERCEL: 
// Local development uses app.listen, but Vercel uses module.exports
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Local Server running on port ${PORT}`));
}

module.exports = app;