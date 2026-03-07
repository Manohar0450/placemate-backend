const mongoose = require('mongoose');

const PrincipalSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    institution: { 
        type: String 
    },
    // --- NEW FIELDS FOR OTP SYSTEM ---
    otp: { 
        type: String 
    },
    otpExpires: { 
        type: Date 
    }
}, { timestamps: true }); // Good practice to track when users were created

module.exports = mongoose.model('Principal', PrincipalSchema);