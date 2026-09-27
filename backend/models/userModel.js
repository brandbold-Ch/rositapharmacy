const mongoose = require("mongoose");
const { Schema } = mongoose;


const userModel = new Schema({
    name: {
        type: String,
        required: true
    },
    lastname: {
        type: String,
        required: true
    },
    phone_number: {
        type: String,
        required: false,
        default: null,
        maxLength: 10,
        minLength: 10
    },
    auth_id: {
        type: Schema.Types.ObjectId,
        required: false,
        default: null,
        ref: "Auth"
    }
});

const User = mongoose.model("User", userModel);
module.exports = { User }
