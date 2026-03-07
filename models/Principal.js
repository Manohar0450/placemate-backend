const mongoose = require('mongoose');
const PrincipalSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    institution: { type: String }
});
module.exports = mongoose.model('Principal', PrincipalSchema);