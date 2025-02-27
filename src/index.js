const express = require('express');
const path = require("path");
const bcrypt = require("bcrypt");
const { User, Group } = require("./config");
const session = require("express-session");

const app = express();

// Middleware and configurations
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60 * 60 * 1000 },
  })
);
app.set('view engine', 'ejs');
app.use(express.static("public"));

// Routes
app.get("/", (req, res) => res.render("about"));
app.get("/login", (req, res) => res.render("login"));
app.get("/signup", (req, res) => res.render("signup"));

app.post("/signup", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).send("Username and password are required.");
        }

        // Check if the user already exists
        const existingUser = await User.findOne({ name: username });
        if (existingUser) {
            return res.send("User already exists. Please choose a different username.");
        }

        // Hash the password and save the user
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new User({ name: username, password: hashedPassword });
        await newUser.save();
        console.log("User registered successfully:", newUser);
        res.redirect("/");
    } catch (error) {
        console.error("Signup Error:", error.message, error.stack);
        res.status(500).send("An error occurred during signup.");
    }
});
app.use((req, res, next) => {
    console.log("Session data:", req.session);
    next();
});

app.post("/login", async (req, res) => {
    try {
        console.log("Request Body:", req.body); // Debugging
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).send("Username and password are required.");
        }

        const user = await User.findOne({ name: username });
        if (!user) {
            console.error("User not found.");
            return res.status(404).send("User not found.");
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (isPasswordMatch) {
            console.log("Login successful for user:", username);
            req.session.username = user.name; // Set session property
            return res.redirect("/dashboard");
        } else {
            console.error("Incorrect password.");
            return res.status(401).send("Incorrect password.");
        }
    } catch (error) {
        console.error("Login Error:", error.message, error.stack);
        res.status(500).send("An error occurred during login.");
    }
});

// Dashboard
app.get("/dashboard", async (req, res) => {
  if (!req.session.username) return res.redirect("/");
  
  try {
    const groups = await Group.find({ creator: req.session.username });
    res.render("dashboard", { 
      user: req.session.username, 
      groups 
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).send("Dashboard error");
  }
});

// Create Group
app.post("/create-group", async (req, res) => {
  try {
    const { groupName } = req.body;
    const user = req.session.username;
    if (!user) return res.redirect("/");

    // Add creator to members array
    const newGroup = await Group.create({
      name: groupName,
      creator: user,
      members: [user], // Include creator as member
      balances: []
    });

    res.redirect(`/add-members/${newGroup._id}`);
  } catch (error) {
    console.error("Create Group Error:", error);
    res.status(500).send("Group creation error");
  }
});

// Add Members Page
app.get("/add-members/:groupId", async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).send("Group not found");

    res.render("addMembers", {
      group,
      members: group.members,
      currentUser: req.session.username // Pass current user to template
    });
  } catch (error) {
    console.error("Add Members Error:", error);
    res.status(500).send("Group load error");
  }
});

// Add Members to Group
app.post("/add-members/:groupId", async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: "Group not found" });

        const newMembers = Array.isArray(req.body.members) ? req.body.members : [req.body.members];
        group.members = [...new Set([...group.members, ...newMembers])];

        await group.save();
        res.json({ success: true, members: group.members });
    } catch (error) {
        console.error("Add Members Error:", error);
        res.status(500).json({ error: "Adding members failed" });
    }
});


app.post("/split-amount/:groupId", async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: "Group not found" });

        const totalAmount = parseFloat(req.body.totalAmount);
        if (isNaN(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({ error: "Invalid amount. Use positive numbers only." });
        }

        // Calculate including all members
        const totalMembers = group.members.length;
        const splitAmount = totalAmount / totalMembers;

        // Create balances for all members
        group.balances = group.members.map(member => ({
            member,
            amount: Number(splitAmount.toFixed(2)),
            owedTo: member === group.creator ? null : group.creator,
            isAdmin: member === group.creator
        }));

        await group.save();
        
        res.json({
            success: true,
            totalMembers,
            splitAmount: splitAmount.toFixed(2),
            balances: group.balances
        });
    } catch (error) {
        console.error("Split Error:", error);
        res.status(500).json({ 
            error: "Calculation failed",
            details: error.message
        });
    }
});

// Delete Member from Group
app.post("/delete-member/:groupId", async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: "Group not found" });

        const { memberToDelete } = req.body;
        group.members = group.members.filter(m => m !== memberToDelete);
        group.balances = group.balances.filter(b => b.member !== memberToDelete);

        await group.save();
        res.json({ success: true, members: group.members });
    } catch (error) {
        console.error("Delete Member Error:", error);
        res.status(500).json({ error: "Member deletion failed" });
    }
});

// Mark Paid
app.post("/mark-paid/:groupId", async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).send("Group not found");

    const memberIndex = parseInt(req.body.memberIndex);
    if (group.balances[memberIndex]) {
      group.balances[memberIndex].amount = 0;
      await group.save();
    }

    res.status(200).send("Payment marked");
  } catch (error) {
    console.error("Payment Error:", error);
    res.status(500).send("Payment error");
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) console.error("Logout Error:", err);
    res.redirect("/");
  });
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));