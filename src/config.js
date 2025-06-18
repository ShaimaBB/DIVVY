const mongoose = require("mongoose");
const connect = mongoose.connect("mongodb://localhost:27017/Login-tut");
connect.then(() => {
    console.log("Database connected Successfully");
})
.catch((error) => {
    console.log("Database cannot be connected");
}) 

const LoginSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    password: {
        type:String,
        required: true
    }
});

const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    creator: { type: String, required: true }, // Creator's username
    members: [{ type: String }], // Array of member names
    balances: [{ member: String, amount: Number }], // Balances for each member
  });
  
const User = mongoose.model("user", LoginSchema);
const Group = mongoose.model("group", GroupSchema);
  
module.exports = { User, Group };


