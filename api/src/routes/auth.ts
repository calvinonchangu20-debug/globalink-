import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key";

router.post("/api/auth/register", async (req, res) => {
  try {
    const { firstName, secondName, username, phoneNumber, email, password } = req.body;
    if (!firstName || !secondName || !username || !phoneNumber || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters long" });
    }

    const phoneRegex = /^(?:254|\+254|0)?(7[0-9]{8}|1[0-9]{8})$/;
    if (!phoneRegex.test(phoneNumber.replace(/\s+/g, ''))) {
      return res.status(400).json({ error: "Invalid Kenyan phone number format" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    // Check if user already exists
    const existingUsers = await db.select().from(users).where(eq(users.email, email));
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "User already exists with this email" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [newUser] = await db.insert(users).values({
      firstName,
      secondName,
      username,
      phoneNumber,
      email,
      passwordHash,
    }).returning();

    res.status(201).json({ 
      message: "User registered successfully",
      user: { id: newUser.id, username: newUser.username, email: newUser.email }
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: "User already exists with this email" });
    }
    console.error("Register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid credentials or use Google Login" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        secondName: user.secondName,
        phoneNumber: user.phoneNumber,
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy");

router.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      return res.status(404).json({ error: "No account found with that email address" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.update(users)
      .set({ otp, otpExpiry })
      .where(eq(users.id, user.id));

    // Send email using Resend
    await resend.emails.send({
      from: "support@globalinktraders.com",
      to: email,
      subject: "Password Reset OTP",
      html: `<p>Your password reset OTP is: <strong>${otp}</strong></p><p>It is valid for 10 minutes.</p>`,
    });

    res.json({ message: "An OTP has been sent to your email" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Email, OTP, and new password are required" });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || user.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP or email" });
    }

    if (!user.otpExpiry || new Date() > user.otpExpiry) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users)
      .set({ passwordHash, otp: null, otpExpiry: null })
      .where(eq(users.id, user.id));

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

import { OAuth2Client } from "google-auth-library";

const getGoogleClientId = () =>
  process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "871676686424-rgb94n2b33e21l435ve6kqccabgnb0fg.apps.googleusercontent.com";

const googleClient = new OAuth2Client(getGoogleClientId());

router.post("/api/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: "No credential provided" });
    }

    const clientId = getGoogleClientId();
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: "Invalid Google token payload" });
    }

    const email = payload.email;
    const givenName = payload.given_name || "Google";
    const familyName = payload.family_name || "User";

    let [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      // Auto-register user
      const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
      
      [user] = await db.insert(users).values({
        firstName: givenName,
        secondName: familyName,
        username: username,
        email: email,
        // Optional fields left null
      }).returning();
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Google login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        secondName: user.secondName,
        phoneNumber: user.phoneNumber,
      }
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(500).json({ error: "Internal server error during Google auth" });
  }
});

export default router;
