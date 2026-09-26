const authService = require('../services/authService');

async function register(req, res) {
    try {
        const user = await authService.register(req.body);

        res-status(201).json({
            success: true,
            message: 'User registered successfully',
            user
        });
    } catch (error) {

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

module.exports = {
    register
};