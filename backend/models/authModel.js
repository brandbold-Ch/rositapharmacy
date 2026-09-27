const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { Schema } = mongoose;

const authModel = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        validate: {
            validator: function (email) {
                return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
            },
            message: "Email con formato inválido"
        }
    },
    password: {
        type: String,
        required: true
    },
    user_id: {
        type: Schema.Types.ObjectId,
        refPath: "doc_model",
        required: true
    },
    role: {
        type: String,
        required: true,
        enum: [
            "USER",
            "ADMINISTRATOR",
            "MEDICO",
        ]
    },
    doc_model: {
        type: String,
        required: true,
        enum: [
            "User",
            "Admin",
        ]
    }
}, {
    versionKey: false
});

authModel.pre("save", async function () {
    this.password = await bcrypt.hash(this.password, 10);
});

authModel.index({ user_id: 1 }, { unique: true });
const Auth = mongoose.model("Auth", authModel);
module.exports = { Auth }