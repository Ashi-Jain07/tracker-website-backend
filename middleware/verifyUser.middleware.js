import jwt from "jsonwebtoken";

export const verifyUser = async (req, res, next) => {
  try {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "No authentication token provided" });
    }

    if (!authHeader.includes(" ")) {
      return res.status(401).json({ message: "Invalid authorization format" });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2) {
      return res.status(401).json({ message: "Invalid authorization format" });
    }

    const [scheme, token] = parts;

    if (scheme.toLowerCase() !== "bearer") {
      return res.status(401).json({ message: "Invalid authorization scheme" });
    }

    if (!token || token.trim() === "") {
      return res.status(401).json({ message: "Token missing" });
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (!decoded?.id) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const userId = decoded.id;
    const userRole = decoded.role;

    req.user = {
      userId: userId,
      userRole: userRole,
    };

    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }

    return res.status(401).json({ message: "Authentication failed" });
  }
};