import { Router } from "express";
import { addToHistory, getUserHistory, login , register } from "../controllers/user.contoller.js";

const router = Router();

// Authentication Routes
router.route("/login").post(login);
router.route("/register").post(register);

// Activity Routes
router.route("/add_to_activity").post(addToHistory);
router.route("/get_all_activity").get(getUserHistory)

export default router;