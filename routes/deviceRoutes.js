import { createDevice, deleteDevice, getDeviceHistory, getDeviceHistoryForAdmin, getLatestDeviceData, getUserDevices, getUserDevicesForAdmin, receiveDeviceData } from "../controllers/deviceController.js"
import { verifyUser } from "../middleware/verifyUser.middleware.js"

export const deviceRoute = (app) => {
    app.post('/api/addDevice', verifyUser, createDevice);
    app.get('/api/getUserDevices', verifyUser, getUserDevices);
    app.post('/api/device-data', receiveDeviceData);
    app.get('/api/getLatestData/:deviceId', verifyUser, getLatestDeviceData);
    app.get('/api/getUserDevicesForAdmin/:userId', verifyUser, getUserDevicesForAdmin);
    app.get('/api/getDeviceHistory/:deviceId', verifyUser, getDeviceHistory);
    app.get('/api/getDeviceHistoryForAdmin/:deviceId/:userId', verifyUser, getDeviceHistoryForAdmin);
    app.delete('/api/deleteDevice/:deviceId', verifyUser, deleteDevice)
};