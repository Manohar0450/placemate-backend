const mongoose = require('mongoose');

const CoordinatorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    dept: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Set by the Principal
    status: { type: String, default: "Invited" },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Coordinator', CoordinatorSchema);