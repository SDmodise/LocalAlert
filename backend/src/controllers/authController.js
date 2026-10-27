const authService = require('../services/authService');

async function register(req, res) {
    try {
        const { token, user } = await authService.register(req.body);

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            user
        });
    } catch (error) {
        if (error instanceof authService.AuthError) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }

        console.error('Registration failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Something went wrong. Please try again.'
        });
    }
}

async function login(req, res) {
    try {
        const { token, user } = await authService.login(req.body);

        res.status(200).json({
            success: true,
            token,
            user
        });
    } catch (error) {
        if (error instanceof authService.AuthError) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }

        console.error('Login failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Something went wrong. Please try again.'
        });
    }
}

module.exports = {
    register,
    login
};
