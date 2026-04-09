import Device from "../models/deviceModel.js";
import DeviceData from "../models/deviceDataModel.js";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import crypto from "node:crypto";

const MIN_INTERVAL = 10 * 1000;
const MIN_DISTANCE = 20;
const lastCache = {};

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const toRad = (x) => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}


//API to add device 
export const createDevice = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { deviceName } = req.body;

    if (!deviceName) {
      return res.status(400).json({ message: "Device name is required" });
    };

    const deviceId = `Device-${nanoid(8)}`;

    // generate raw key
    const rawApiKey = crypto.randomBytes(16).toString("hex");

    // hash it
    const hashedApiKey = await bcrypt.hash(rawApiKey, 10);

    await Device.create({
      deviceId,
      deviceName,
      apiKey: hashedApiKey,
      userId
    });

    // send raw key only once
    res.json({
      message: "Device created Successfully",
      deviceId,
      deviceName,
      apiKey: rawApiKey
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const receiveDeviceData = async (req, res) => {
  try {
    const { deviceId, apiKey, latitude, longitude, weight, temperature } = req.body;

    if (!deviceId || !apiKey) {
      return res.status(400).json({ message: "Missing credentials" });
    }
    console.log("Incoming:", { deviceId, apiKey });
    //f validate device
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }
    console.log("Device from DB:", device);
    const isMatch = await bcrypt.compare(apiKey, device.apiKey);
    console.log(isMatch);
    if (!device || !isMatch) {
      return res.status(401).json({ message: "Unauthorized device" });
    }

    const lastData = lastCache[deviceId];
    console.log("lastData", lastData);

    if (lastData) {
      const timeDiff = Date.now() - new Date(lastData.timestamp).getTime();

      const distance = getDistance(
        lastData.latitude,
        lastData.longitude,
        latitude,
        longitude
      );

      console.log("distance", distance);
      console.log("timeDiff", timeDiff);

      if (timeDiff < MIN_INTERVAL && distance < MIN_DISTANCE) {
        req.io.emit(`device-${deviceId}`, {
          deviceId,
          latitude,
          longitude,
          weight,
          temperature
        });
        return res.status(200).json({ message: "Skipped (no significant change)" });
      }
    }

    //  reverse geocode (optional)
    let locationName = "";
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        { headers: { "User-Agent": "iot-app" } }
      );
      const geoData = await geoRes.json();
      locationName = geoData.display_name;
      console.log("Geocoded location:", locationName);
    } catch (e) {
      console.log("Geo error", e.message);
    }

    // save history
    const savedData = await DeviceData.create({
      deviceId,
      latitude,
      longitude,
      weight,
      temperature,
      locationName
    });

    console.log("Data saved:", savedData);

    lastCache[deviceId] = savedData;

    // emit real-time
    // req.io.emit(`device-${deviceId}`, savedData);
    req.io.to(deviceId).emit(`device-${deviceId}`, savedData);

    res.status(200).json({ message: "Data received" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


//API to get device data 
export const getLatestDeviceData = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const latest = await DeviceData.findOne({ deviceId })
      .sort({ timestamp: -1 });

    if (!latest) {
      return res.status(404).json({ message: "No data found for this device" });
    }

    res.status(200).json(latest);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//Get all devices for a user
export const getUserDevices = async (req, res) => {
  try {
    const userId = req.user.userId;

    const devices = await Device.find({ userId })
      .select("-apiKey -__v");

    if (devices.length === 0) {
      return res.status(200).json({
        count: 0,
        devices: []
      });
    }

    res.status(200).json({
      count: devices.length,
      devices: devices
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//Get all devices for a user for admin
export const getUserDevicesForAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const { userRole } = req.user;

    if (userRole !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const devices = await Device.find({ userId })
      .select("-apiKey -__v");

    if (devices.length === 0) {
      return res.status(200).json({
        count: 0,
        devices: []
      });
    }

    res.status(200).json({
      count: devices.length,
      devices: devices
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getDeviceHistory = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.userId;

    // check ownership
    const device = await Device.findOne({ deviceId, userId });

    if (!device) {
      return res.status(403).json({ message: "Unauthorized access to device" });
    }

    // Get today's start & end
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch today's data
    const history = await DeviceData.find({
      deviceId,
      timestamp: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).sort({ timestamp: 1 }); // ascending for grouping

    if (history.length === 0) {
      return res.status(404).json({ message: "No data found for today" });
    }

    //  Filter: 1 record per 30 minutes
    const filtered = [];
    let lastTime = null;

    for (let item of history) {
      if (!lastTime) {
        filtered.push(item);
        lastTime = new Date(item.timestamp);
      } else {
        const diff = new Date(item.timestamp) - lastTime;

        if (diff >= 30 * 60 * 1000) { // 30 minutes
          filtered.push(item);
          lastTime = new Date(item.timestamp);
        }
      }
    }

    res.status(200).json({
      count: filtered.length,
      data: filtered
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//Get device data history for admin
export const getDeviceHistoryForAdmin = async (req, res) => {
  try {
    const { deviceId, userId } = req.params;
    const { userRole } = req.user;

    if (userRole !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    // check ownership
    const device = await Device.findOne({ deviceId, userId });

    if (!device) {
      return res.status(403).json({ message: "Unauthorized access to device" });
    }

    // Get today's start & end
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch today's data
    const history = await DeviceData.find({
      deviceId,
      timestamp: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).sort({ timestamp: 1 }); // ascending for grouping

    if (history.length === 0) {
      return res.status(404).json({ message: "No data found for today" });
    }

    //  Filter: 1 record per 30 minutes
    const filtered = [];
    let lastTime = null;

    for (let item of history) {
      if (!lastTime) {
        filtered.push(item);
        lastTime = new Date(item.timestamp);
      } else {
        const diff = new Date(item.timestamp) - lastTime;

        if (diff >= 30 * 60 * 1000) { // 30 minutes
          filtered.push(item);
          lastTime = new Date(item.timestamp);
        }
      }
    }

    res.status(200).json({
      count: filtered.length,
      data: filtered
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//Delete a device and its data
export const deleteDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.userId;

    // check ownership
    const device = await Device.findOne({ deviceId, userId });

    if (!device) {
      return res.status(404).json({
        message: "Device not found or unauthorized"
      });
    }

    // delete device
    await Device.deleteOne({ deviceId });

    // delete all related data
    await DeviceData.deleteMany({ deviceId });

    res.status(200).json({
      message: "Device and all its data deleted successfully"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};