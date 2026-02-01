'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { useDispatch, useSelector } from 'react-redux';
import { resetPassword } from '../redux-features/auth/auth';

const ResetPasswordContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.auth);

  const uid = searchParams.get('uid');
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleReset = async (e) => {
    e.preventDefault();
    
    // Validate passwords match
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    // Validate password strength
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    // Validate uid and token exist
    if (!uid || !token) {
      toast.error('Invalid reset link. Please request a new password reset.');
      return;
    }

    try {
      const resultAction = await dispatch(
        resetPassword({
          uid,
          token,
          newPassword,
          confirmPassword,
        })
      );

      if (resetPassword.fulfilled.match(resultAction)) {
        toast.success('Password reset successfully! Redirecting to login...');
        
        // Redirect to login page after successful reset
        setTimeout(() => {
          router.push('/login');
        }, 1500);
      } else if (resetPassword.rejected.match(resultAction)) {
        // Handle rejection with meaningful error message
        const errorMessage = resultAction.error?.message || 
                            resultAction.payload?.message || 
                            'Failed to reset password. The reset link may have expired.';
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('Password reset error:', error);
      
      // Handle different error scenarios
      let errorMessage = 'An unexpected error occurred while resetting password.';
      
      if (error.message) {
        errorMessage = error.message;
      }
      
      // Check for common error patterns
      if (error.message?.includes('expired') || error.message?.includes('invalid')) {
        errorMessage = 'Reset link has expired or is invalid. Please request a new password reset.';
      } else if (error.message?.includes('network') || error.message?.includes('timeout')) {
        errorMessage = 'Unable to connect to server. Please check your internet connection.';
      }
      
      toast.error(errorMessage);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Reset Your Password</h2>
        <form onSubmit={handleReset} className="space-y-4">
          <Input
            type="password"
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </Button>
        </form>
      </div>
    </div>
  );
};

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    </div>
  );
}

const ResetPassword = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
};

export default ResetPassword;
