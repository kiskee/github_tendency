import { Request, Response, NextFunction } from "express";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("Error: API_KEY no definida en .env");
  process.exit(1);
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const key = req.headers["x-api-key"] as string
    || req.headers["authorization"]?.replace("Bearer ", "");

  if (!key || key !== API_KEY) {
    console.log("Error: Unauthorized")
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};
