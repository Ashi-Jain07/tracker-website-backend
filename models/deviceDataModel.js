import mongoose from "mongoose";

const deviceDataSchema = new mongoose.Schema({
  deviceId: String,
  latitude: Number,
  longitude: Number,
  weight: Number,
  temperature: Number,
  locationName: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

deviceDataSchema.index({ deviceId: 1, timestamp: -1 });

const DeviceData = mongoose.model("DeviceData", deviceDataSchema);
export default DeviceData;