/*
This code loads enviroment variables.
Connects to PostgreSQL
Starts the Express server only if the database is connection succeeds.
*/
require("dotenv").config();

const app = require("./app");
const pool = require("./config/database");

console.log("Pool object:", pool);

const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        await pool.query("SELECT NOW()");
        console.log("Connected to PostgreSQL");
    
        app.listen(PORT, () => {
            console.error(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Database connection failed");
        console.error(error.message);
        process.exit(1);
    }
}

startServer();