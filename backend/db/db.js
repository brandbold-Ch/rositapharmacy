const mongoose = require("mongoose");


mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pharmacy", {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000
}).catch((error) => console.error("MongoDB connection error:", error.message));

const openConn = mongoose.connection;

openConn.on("error", (error) => console.error("MongoDB connection error:", error.message));
openConn.on("connected", () => console.log("Connection to Database is successful"));
openConn.on("reconnected", () => console.log("Reconnected"));

module.exports = {
    openConn
}
