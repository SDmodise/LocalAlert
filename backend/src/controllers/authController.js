const authService = require('../services/authService');
const passwordReset = require('../services/passwordResetService');

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

// Forgot password: step 1 (email a code) and step 2 (code + new password).
function handle(action, label) {
    return async (req, res) => {
        try {
            res.status(200).json({ success: true, ...(await action(req.body)) });
        } catch (error) {
            if (error instanceof authService.AuthError) {
                return res.status(error.status).json({ success: false, message: error.message });
            }
            console.error(`${label} failed:`, error.message);
            res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
        }
    };
}

const forgotPassword = handle(passwordReset.requestReset, 'Password reset request');
const resetPassword = handle(passwordReset.resetPassword, 'Password reset');

module.exports = {
    register,
    login,
    forgotPassword,
    resetPassword
};
