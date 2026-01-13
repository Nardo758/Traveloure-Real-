'use client';

import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { changePassword } from '../redux-features/auth/auth';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const ChangePasswordForm = () => {
  const dispatch = useDispatch();
  const {data:session} = useSession();
  const token = session?.backendData?.accessToken;
  const { loading } = useSelector((state) => state.auth);

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
const router = useRouter();
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmNewPassword) {
      toast.error("New passwords do not match");
      return;
    }

    try {
      const result = await dispatch(
        changePassword({
          newPassword,
          confirmNewPassword,
          token:session?.backendData?.accessToken
        })
      );

      if (changePassword.fulfilled.match(result)) {
      
        setNewPassword('');
        setConfirmNewPassword('');
          toast.success("Password changed successfully"); 
           if (changePassword.fulfilled.match(resultAction)) {
      
            router.push('/');
          } 
      } 
    } catch {
      console.log("error")
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-xl shadow-md">
      <h2 className="text-xl font-semibold text-center mb-4">Change Password</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
       
        <Input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder="Confirm New Password"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          required
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Changing...' : 'Change Password'}
        </Button>
      </form>
    </div>
  );
};

export default ChangePasswordForm;
