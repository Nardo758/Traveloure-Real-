"use client";

import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "sonner";
import { forgotPassword } from "../redux-features/auth/auth";

export default function ForgotPasswordPage() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.auth);

  const handleRequestReset = async (e) => {
    e.preventDefault();

    if (!emailOrUsername) {
      toast.error("Please enter your email or username");
      return;
    }

    try {
      const resultAction = await dispatch(forgotPassword(emailOrUsername));
      
      // Check if the action was successful
      if (forgotPassword.fulfilled.match(resultAction)) {
        toast.success("Password reset link sent! Please check your email.");
        setEmailOrUsername(""); // Clear the form
      } else if (forgotPassword.rejected.match(resultAction)) {
        // Handle rejection
        const errorMessage = resultAction.error?.message || 
                            resultAction.payload?.message || 
                            "Failed to send reset link. Please try again.";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      
      // Handle unexpected errors
      const errorMessage = error.message || "An unexpected error occurred. Please try again.";
      toast.error(errorMessage);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-center mb-6 text-[#FF385C]">Forgot Password</h2>

      <form onSubmit={handleRequestReset} className="space-y-4">
        <div>
          <label htmlFor="emailOrUsername" className="block text-sm font-medium mb-1">
            Email or Username
          </label>
          <input
            id="emailOrUsername"
            type="text"
            placeholder="Enter your email or username"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            className="w-full p-3 border rounded-lg"
            disabled={loading}
            required
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-[#FF385C] text-white rounded-lg hover:bg-[#FF385C] transition"
          disabled={loading}
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>
    </div>
  );
}
