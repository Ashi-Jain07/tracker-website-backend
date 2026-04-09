import { deleteUser, editUser, fetchAllUsers, loginUser, logout, refreshAccessToken, registerUser, resetPassword, verifyToken } from "../controllers/userController.js"
import { verifyUser } from "../middleware/verifyUser.middleware.js";

export const userRoutes = (app) => {
    app.post('/api/user/register', verifyUser, registerUser);
    app.delete('/api/user/deleteUser/:userId', verifyUser, deleteUser);
    app.put('/api/user/editUser/:userId', verifyUser, editUser);
    app.post('/api/user/login', loginUser);
    app.put('/api/user/resetPassword', resetPassword);
    app.post("/api/user/refreshtoken", refreshAccessToken);
    app.get("/api/user/verify-token", verifyToken);
    app.post('/api/user/logout', verifyUser, logout);
    app.get('/api/user/getAllUsers', verifyUser, fetchAllUsers);
};