const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const municipalityRoutes = require("./routes/municipalityRoutes");
const userRoutes = require("./routes/userRoutes");
const familyRoutes = require("./routes/familyRoutes");
const invitationRoutes = require("./routes/invitationRoutes");
const alertRoutes = require("./routes/alertRoutes");
const publicRoutes = require("./routes/publicRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

// Behind a tunnel or hosting proxy: use its https address when building share links.
app.set("trust proxy", true);

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/municipalities", municipalityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/family-groups", familyRoutes.groups);
app.use("/api/family-members", familyRoutes.members);
app.use("/api/invitations", invitationRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/a", publicRoutes); // shared alert pages

app.get("/", (req, res) => {
    res.json({
        message: "Localized Amber Alert API is running."
    });
});

module.exports = app;