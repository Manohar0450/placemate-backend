const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const Principal = require('../models/Principal');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

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

// --- REGISTRATION ROUTE ---
app.post('/register', async (req, res) => {
    await connectToDB();
    try {
        const { name, email, password, phone, institution } = req.body;
        
        const existingUser = await Principal.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "Email already registered" });
        }

        const newPrincipal = new Principal({ 
            name, 
            email, 
            password, 
            phone, 
            institution 
        });

        await newPrincipal.save();
        res.status(201).json({ message: "Registration successful!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LOGIN ROUTE ---
app.post('/login', async (req, res) => {
    await connectToDB();
    try {
        const { email, password } = req.body;
        const principal = await Principal.findOne({ email });

        if (!principal || principal.password !== password) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        res.status(200).json({ 
            message: "Login successful", 
            principal: { name: principal.name, email: principal.email } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;