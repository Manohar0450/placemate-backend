const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const Principal = require('../models/Principal');
const Coordinator = require('../models/Coordinator');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// --- NODEMAILER CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Connection caching for Vercel/Serverless performance
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

// ─── NOTIFICATION HELPER ─────────────────────────────────────
/**
 * Push a notification to one or many userIds.
 * @param {string|string[]} userIds
 * @param {string} type  welcome|application|placement|security|risk|info
 * @param {string} title
 * @param {string} message
 */
const pushNotification = async (userIds, type, title, message) => {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (!ids.length) return;

    const docs = ids.map(userId => ({
        userId,
        type,
        title,
        message,
        isRead: false,
        createdAt: new Date(),
    }));

    await mongoose.connection.collection('notifications').insertMany(docs);
};

// ─────────────────────────────────────────────────────────────
// 1. PRINCIPAL & COORDINATOR AUTH ROUTES
// ─────────────────────────────────────────────────────────────

app.post('/register', async (req, res) => {
    await connectToDB();
    try {
        const { name, email, password, phone, institution } = req.body;

        const exists = await Principal.findOne({ email });
        if (exists && exists.isVerified) {
            return res.status(400).json({ error: "Principal with this email already exists" });
        }

        const institutionExists = await Principal.findOne({
            institution: { $regex: new RegExp(`^${institution}$`, 'i') },
            isVerified: true
        });
        if (institutionExists) {
            return res.status(400).json({ error: "This institution is already registered." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        if (exists && !exists.isVerified) {
            exists.otp = otp;
            exists.otpExpires = otpExpires;
            exists.name = name;
            exists.password = password;
            exists.phone = phone;
            exists.institution = institution;
            await exists.save();
        } else {
            const newPrincipal = new Principal({
                name, email, password, phone, institution,
                otp, otpExpires, isVerified: false
            });
            await newPrincipal.save();
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Verify your Placemate Account',
            html: `<h3>Welcome to Placemate, ${name}!</h3>
                   <p>Your verification code for <b>${institution}</b> is: <b>${otp}</b></p>
                   <p>This code expires in 10 minutes.</p>
                   <p>---> Manohar.</p>`
        };

        await transporter.sendMail(mailOptions);
        res.status(201).json({ message: "OTP sent to email. Please verify." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/verify-otp', async (req, res) => {
    await connectToDB();
    try {
        const { email, otp } = req.body;
        const principal = await Principal.findOne({ email });

        if (!principal) return res.status(404).json({ error: "User not found" });

        if (principal.otp === otp && principal.otpExpires > Date.now()) {
            principal.isVerified = true;
            principal.otp = null;
            principal.otpExpires = null;
            await principal.save();

            // 🔔 Welcome notification for principal
            await pushNotification(
                principal._id.toString(),
                'welcome',
                'Account Successfully Created',
                `Welcome, ${principal.name}! Your principal account for ${principal.institution} is now active.`
            );
            await pushNotification(
                principal._id.toString(),
                'security',
                'Security Update',
                'We recommend enabling Two-Factor Authentication (2FA) in your account settings.'
            );

            res.status(200).json({ message: "Email verified successfully!" });
        } else {
            res.status(400).json({ error: "Invalid or expired OTP" });
        }
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
        if (!principal.isVerified) {
            return res.status(403).json({ error: "Please verify your email before logging in." });
        }

        res.status(200).json({ message: "Login success", principal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

        // 🔔 Welcome notification to coordinator
        await pushNotification(
            newCoord._id.toString(),
            'welcome',
            'Welcome to Placemate!',
            `Your coordinator account has been created for the ${dept} department. You can now manage students and placements.`
        );

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

// ─────────────────────────────────────────────────────────────
// 2. PLACEMENT ROUTES
// ─────────────────────────────────────────────────────────────

app.post('/add-placement', async (req, res) => {
    await connectToDB();
    try {
        const { company, role, lpa, stage, createdBy } = req.body;
        const newPlacement = { company, role, lpa, stage, createdBy, createdAt: new Date() };
        const result = await mongoose.connection.collection('placements').insertOne(newPlacement);

        // 🔔 Notify ALL students that a new placement is available
        // Find all students under this coordinator's institution
        const allStudents = await mongoose.connection.collection('students')
            .find({ createdBy })
            .toArray();

        if (allStudents.length > 0) {
            const studentIds = allStudents.map(s => s._id.toString());
            await pushNotification(
                studentIds,
                'placement',
                `New Placement: ${company}`,
                `${company} is hiring for ${role} at ${lpa}. Check the Placements tab to apply!`
            );
        }

        res.status(201).json({ message: "Placement added successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/all-placements', async (req, res) => {
    await connectToDB();
    try {
        const list = await mongoose.connection.collection('placements')
            .find().sort({ createdAt: -1 }).toArray();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/update-placement/:id', async (req, res) => {
    await connectToDB();
    try {
        const { id } = req.params;
        const { company, role, lpa, stage } = req.body;
        await mongoose.connection.collection('placements').updateOne(
            { _id: new mongoose.Types.ObjectId(id) },
            { $set: { company, role, lpa, stage, updatedAt: new Date() } }
        );
        res.json({ message: "Placement updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/delete-placement/:id', async (req, res) => {
    await connectToDB();
    try {
        await mongoose.connection.collection('placements').deleteOne({
            _id: new mongoose.Types.ObjectId(req.params.id)
        });
        res.json({ message: "Placement deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 3. STUDENT ROUTES
// ─────────────────────────────────────────────────────────────

app.post('/add-student', async (req, res) => {
    await connectToDB();
    try {
        const { name, email, dept, rollId, risk, password, createdBy } = req.body;
        const idExists = await mongoose.connection.collection('students').findOne({ rollId });
        if (idExists) return res.status(400).json({ error: "Roll ID already exists" });

        const newStudent = { name, email, dept, rollId, risk, password, createdBy, createdAt: new Date() };
        const result = await mongoose.connection.collection('students').insertOne(newStudent);

        // 🔔 Welcome notification to student
        await pushNotification(
            result.insertedId.toString(),
            'welcome',
            'Welcome to Placemate!',
            `Hi ${name}, your student account has been created. You can now browse and apply for placements.`
        );

        res.status(201).json({ message: "Student registered successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/students/:coordinatorId', async (req, res) => {
    await connectToDB();
    try {
        const list = await mongoose.connection.collection('students')
            .find({ createdBy: req.params.coordinatorId }).toArray();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 4. PROFILE UPDATE ROUTES
// ─────────────────────────────────────────────────────────────

app.put('/update-principal/:id', async (req, res) => {
    await connectToDB();
    try {
        const { name, phone, institution } = req.body;
        const updated = await Principal.findByIdAndUpdate(
            req.params.id, { name, phone, institution }, { new: true }
        );
        res.json({ message: "Profile updated", principal: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/update-coordinator/:id', async (req, res) => {
    await connectToDB();
    try {
        const updated = await Coordinator.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: "Coordinator updated", coordinator: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/update-student/:rollId', async (req, res) => {
    await connectToDB();
    try {
        await mongoose.connection.collection('students').findOneAndUpdate(
            { rollId: req.params.rollId },
            { $set: { ...req.body, updatedAt: new Date() } }
        );
        res.json({ message: "Student updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 5. JOB APPLICATIONS
// ─────────────────────────────────────────────────────────────

app.post('/apply-job', async (req, res) => {
    await connectToDB();
    try {
        const { rollId, company, role, placementId } = req.body;
        const application = { ...req.body, status: "Pending", appliedAt: new Date() };
        await mongoose.connection.collection('job_applications').insertOne(application);

        // Find the student to get their coordinatorId and name
        const student = await mongoose.connection.collection('students')
            .findOne({ rollId });

        if (student) {
            // 🔔 Notify the coordinator that a student applied
            const coordinator = await Coordinator.findById(student.createdBy);
            if (coordinator) {
                await pushNotification(
                    coordinator._id.toString(),
                    'application',
                    `${student.name} Applied`,
                    `${student.name} (${rollId}) has applied for ${role} at ${company}.`
                );

                // 🔔 Also notify the principal
                await pushNotification(
                    coordinator.createdBy.toString(),
                    'application',
                    `New Application — ${company}`,
                    `${student.name} (${student.dept}) applied for ${role} at ${company}.`
                );
            }
        }

        res.status(201).json({ message: "Application submitted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/my-applications/:rollId', async (req, res) => {
    await connectToDB();
    try {
        const list = await mongoose.connection.collection('job_applications')
            .find({ rollId: req.params.rollId }).toArray();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 6. NOTIFICATION ROUTES
// ─────────────────────────────────────────────────────────────

// GET all notifications for a user (newest first)
app.get('/notifications/:userId', async (req, res) => {
    await connectToDB();
    try {
        const list = await mongoose.connection.collection('notifications')
            .find({ userId: req.params.userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET unread count only
app.get('/notifications/:userId/unread-count', async (req, res) => {
    await connectToDB();
    try {
        const count = await mongoose.connection.collection('notifications')
            .countDocuments({ userId: req.params.userId, isRead: false });
        res.json({ count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH mark all as read
app.patch('/notifications/:userId/mark-read', async (req, res) => {
    await connectToDB();
    try {
        await mongoose.connection.collection('notifications').updateMany(
            { userId: req.params.userId, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ message: "Marked all as read" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE clear all notifications for user
app.delete('/notifications/:userId/clear', async (req, res) => {
    await connectToDB();
    try {
        await mongoose.connection.collection('notifications').deleteMany(
            { userId: req.params.userId }
        );
        res.json({ message: "All notifications cleared" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// RISK PATCH ROUTE (used by coordinator)
// ─────────────────────────────────────────────────────────────
app.patch('/student/risk', async (req, res) => {
    await connectToDB();
    try {
        const { rollId, newRisk } = req.body;
        await mongoose.connection.collection('students').updateOne(
            { rollId },
            { $set: { risk: newRisk, updatedAt: new Date() } }
        );

        // 🔔 Notify student if marked High Risk
        if (newRisk === 'High') {
            const student = await mongoose.connection.collection('students')
                .findOne({ rollId });
            if (student) {
                await pushNotification(
                    student._id.toString(),
                    'risk',
                    'Risk Level Updated',
                    'Your placement risk level has been marked as High. Please speak to your coordinator.'
                );
            }
        }

        res.json({ message: "Risk updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// BASE ROUTE
// ─────────────────────────────────────────────────────────────
app.get('/', (req, res) =>
    res.send("Placemate Unified API is Live! Created by Manohar Nallamsetty")
);

module.exports = app;