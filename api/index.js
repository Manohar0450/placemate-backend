const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Import models
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

// --- 2. COORDINATOR ROUTES ---

app.post('/coordinator/login', async (req, res) => {
    await connectToDB();
    try {
        const { email, password } = req.body;
        const coordinator = await Coordinator.findOne({ email });
        if (!coordinator || coordinator.password !== password) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        res.status(200).json({ message: "Coordinator login success", coordinator });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/add-coordinator', async (req, res) => {
    await connectToDB();
    try {
        const { name, email, dept, password, createdBy } = req.body;
        if (!createdBy) return res.status(400).json({ error: "Principal ID required" });

        const exists = await Coordinator.findOne({ email });
        if (exists) return res.status(400).json({ error: "Coordinator already exists" });

        const newCoord = new Coordinator({ name, email, dept, password, createdBy });
        await newCoord.save();
        res.status(201).json(newCoord);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/coordinators/:principalId', async (req, res) => {
    await connectToDB();
    try {
        const list = await Coordinator.find({ createdBy: req.params.principalId }).sort({ createdAt: -1 });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/coordinator/:id', async (req, res) => {
    await connectToDB();
    try {
        await Coordinator.findByIdAndDelete(req.params.id);
        res.json({ message: "Coordinator deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 3. PLACEMENT ROUTES ---

app.post('/add-placement', async (req, res) => {
    await connectToDB();
    try {
        const { company, role, lpa, stage, createdBy } = req.body;
        if (!createdBy) return res.status(400).json({ error: "Coordinator ID required" });

        const newPlacement = { company, role, lpa, stage, createdBy, createdAt: new Date() };
        await mongoose.connection.collection('placements').insertOne(newPlacement);
        res.status(201).json({ message: "Placement added successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/all-placements', async (req, res) => {
    await connectToDB();
    try {
        const list = await mongoose.connection.collection('placements').find().sort({ createdAt: -1 }).toArray();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 4. STUDENT ROUTES ---

app.post('/add-student', async (req, res) => {
    await connectToDB();
    try {
        const { name, email, dept, rollId, risk, password, createdBy } = req.body;
        if (!createdBy) return res.status(400).json({ error: "Coordinator ID required" });

        const idExists = await mongoose.connection.collection('students').findOne({ rollId });
        if (idExists) return res.status(400).json({ error: "Student Roll ID already exists" });

        const emailExists = await mongoose.connection.collection('students').findOne({ email });
        if (emailExists) return res.status(400).json({ error: "Email already registered" });

        const newStudent = { name, email, dept, rollId, risk, password, createdBy, createdAt: new Date() };
        await mongoose.connection.collection('students').insertOne(newStudent);
        res.status(201).json({ message: "Student registered successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/students/:coordinatorId', async (req, res) => {
    await connectToDB();
    try {
        const list = await mongoose.connection.collection('students')
            .find({ createdBy: req.params.coordinatorId })
            .sort({ name: 1 }).toArray();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/student/risk', async (req, res) => {
    await connectToDB();
    try {
        const { rollId, newRisk } = req.body;
        const result = await mongoose.connection.collection('students').updateOne(
            { rollId: rollId },
            { $set: { risk: newRisk } }
        );
        if (result.matchedCount === 0) return res.status(404).json({ error: "Student not found" });
        res.json({ message: "Risk level updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/student/:rollId', async (req, res) => {
    await connectToDB();
    try {
        const result = await mongoose.connection.collection('students').deleteOne({ rollId: req.params.rollId });
        if (result.deletedCount === 0) return res.status(404).json({ error: "Student not found" });
        res.json({ message: "Student record deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/student/login', async (req, res) => {
    await connectToDB();
    try {
        const { rollId, password } = req.body;
        const student = await mongoose.connection.collection('students').findOne({ rollId });
        if (!student || student.password !== password) {
            return res.status(401).json({ error: "Invalid ID or Password" });
        }
        res.status(200).json({ message: "Student login success", student });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 5. APPLICATION ROUTES ---

// Student: Submit Application
app.post('/apply-job', async (req, res) => {
    await connectToDB();
    try {
        const { rollId, studentName, companyName, role } = req.body;
        const application = {
            rollId,
            studentName,
            companyName,
            role,
            status: "Pending",
            appliedAt: new Date()
        };
        await mongoose.connection.collection('job_applications').insertOne(application);
        res.status(201).json({ message: "Application submitted successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Student: Get personal applications
app.get('/my-applications/:rollId', async (req, res) => {
    await connectToDB();
    try {
        const list = await mongoose.connection.collection('job_applications')
            .find({ rollId: req.params.rollId })
            .sort({ appliedAt: -1 }).toArray();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Coordinator: Get applicants for a SPECIFIC company
app.get('/applications/by-company/:companyName', async (req, res) => {
    await connectToDB();
    try {
        const { companyName } = req.params;
        const list = await mongoose.connection.collection('job_applications')
            .find({ companyName: companyName })
            .sort({ appliedAt: -1 })
            .toArray();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Coordinator: Get ALL student applications
app.get('/coordinator/applications', async (req, res) => {
    await connectToDB();
    try {
        const list = await mongoose.connection.collection('job_applications')
            .find()
            .sort({ appliedAt: -1 })
            .toArray();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 6. BASE ROUTES ---

app.get('/', (req, res) => res.send("Placemate Unified API is Live! Created by Manohar Nallamsetty"));

module.exports = app;