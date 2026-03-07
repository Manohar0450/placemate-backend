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
    },
    isVerified: { 
        type: Boolean, 
        default: false 
    }
}, { timestamps: true });

// --- AUTO-DELETE INDEX ---
// This index will automatically remove the document when 'otpExpires' is reached.
// If 'otpExpires' is null (after verification), the document is safe.
PrincipalSchema.index({ otpExpires: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Principal', PrincipalSchema);