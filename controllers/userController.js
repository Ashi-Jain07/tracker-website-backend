import User from "../models/userModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import DeviceData from "../models/deviceDataModel.js";
import Device from "../models/deviceModel.js";

export const registerUser = async (req, res) => {
    try {
        const { userRole } = req.user;

        if (userRole !== 'admin') {
            return res.status(403).json({ message: "Access denied" });
        }

        const { userName, email, password } = req.body;
        if (!userName || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (password && password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            userName,
            email,
            password: hashedPassword
        });

        await newUser.save();
        res.status(201).json({ message: "User Added successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const deleteUser = async (req, res) => {
    try {
        const { userRole } = req.user;
        const { userId } = req.params;

        if (userRole !== "admin") {
            return res.status(403).json({ message: "Access denied" });
        }

        // Delete user
        const deletedUser = await User.findByIdAndDelete(userId);

        if (!deletedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Get all devices of user
        const devices = await Device.find({ userId });

        const deviceIds = devices.map(d => d.deviceId);

        // Delete all device data
        const deletedData = await DeviceData.deleteMany({
            deviceId: { $in: deviceIds }
        });

        // Delete devices
        const deletedDevices = await Device.deleteMany({ userId });

        const message = `User deleted successfully with ${deletedDevices.deletedCount} device(s)`;

        res.status(200).json({
            message: message
        });

    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

export const editUser = async (req, res) => {
    try {
        const { userRole } = req.user;
        const { userId } = req.params;
        const { userName, password } = req.body;

        if (userRole !== 'admin') {
            return res.status(403).json({ message: "Access denied" });
        };

        if (!userId || (!userName && !password)) {
            return res.status(400).json({ message: "Provide required details" });
        }

        const user = await User.findById(userId).select('-password -refreshToken');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (userName) {
            user.userName = userName
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            user.password = hashedPassword
        }

        await user.save();

        res.status(200).json({ message: "User Updated Successfully" })
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
}

export const loginUser = async (req, res) => {
    try {
        let { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        email = email.toLowerCase();

        let user;

        // ADMIN LOGIN
        if (email === process.env.ADMIN_EMAIL) {
            user = await User.findOne({ email });

            if (!user) {
                const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);

                user = await User.create({
                    userName: "Admin",
                    email,
                    password: hashedPassword,
                    role: "admin"
                });
            }
        } else {
            user = await User.findOne({ email });
            if (!user) return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const accessToken = jwt.sign(
            { id: user._id, role: user.role },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: "1h" }
        );

        const refreshToken = jwt.sign(
            { id: user._id, role: user.role },
            process.env.REFRESH_TOKEN_SECRET,
            { expiresIn: "7d" }
        );

        user.refreshToken = refreshToken;
        await user.save();

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({
            userName: user.userName,
            userRole: user.role,
            accessToken
        });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const fetchAllUsers = async (req, res) => {
    try {

        const { userRole } = req.user;
        if (userRole !== 'admin') {
            return res.status(403).json({ message: "Access denied" });
        }

        const users = await User.find().select('-refreshToken -deviceId -weight -latitude -longitude');
        const filteredUsers = users.filter(user => user.role !== 'admin');
        res.status(200).json(filteredUsers);

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email && !password) {
            return res.status(400).json({ message: "Provide all details" });
        }

        if (password && password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        const user = await User.findOne({ email })
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        };

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword

        await user.save();

        res.status(200).json({ message: "Password updated successfully" });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
}


export function verifyToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw createError.Unauthorized('Access token is required');
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            throw createError.Unauthorized('Access token is required');
        }

        try {
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

            return res.status(200).json({
                success: true,
                message: 'Token is valid',
            });

        } catch (err) {

            if (err.name === 'TokenExpiredError') {
                throw createError.Unauthorized('Token has expired');
            } else if (err.name === 'JsonWebTokenError') {
                throw createError.Unauthorized('Invalid token');
            } else {
                throw createError.InternalServerError();
            }
        }
    } catch (error) {
        next(error);
    }
}

//Api for refresh token
export async function refreshAccessToken(req, res) {
    try {
        console.log('refresh token called');

        const refreshToken = req.cookies.refreshToken;
        console.log("refresh token", refreshToken);


        if (!refreshToken) {
            return res.status(401).json({ message: "No refresh token provided" });
        }

        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        if (!decoded?.id) {
            return res.status(403).json({ message: "Invalid refresh token" });
        }

        const user = await User.findOne({ refreshToken });
        if (!user) {
            return res.status(403).json({ message: "User not found or token mismatch" });
        }

        const newAccessToken = jwt.sign(
            { id: user._id, role: user.role },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: "15m" }
        );

        return res.status(200).json({ accessToken: newAccessToken });

    } catch (err) {
        return res.status(403).json({ message: "Invalid refresh token", error: err.message });
    }
}

export const logout = async (req, res) => {
    try {

        const { userId } = req.user;

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: true,
            sameSite: "strict"
        });

        if (userId) {
            await User.updateOne(
                { _id: userId },
                { $unset: { refreshToken: "" } }
            );
        }

        return res.status(200).json({ message: "Logged out successfully" });

    } catch (error) {
        return res.status(500).json({
            message: "Internal server error",
            error: error.message
        });
    }
};