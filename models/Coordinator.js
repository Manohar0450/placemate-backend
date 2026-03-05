const mongoose = require('mongoose');

const CoordinatorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    dept: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // LINK FIELD
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Principal', 
        required: true 
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Coordinator', CoordinatorSchema);