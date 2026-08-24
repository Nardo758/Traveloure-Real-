"use client";

import { memo } from 'react';
import Image from 'next/image';
import { Button } from '../../components/ui/button';

const SocialLoginButton = memo(function SocialLoginButton({
  onClick,
  iconSrc,
  alt,
  children,
  disabled,
  className,
}) {
  const isSvg = iconSrc?.endsWith('.svg');
  
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="outline"
      disabled={disabled}
      className={`w-full py-3 bg-[#F3F4F6] rounded-[30px] text-gray-700 flex items-center justify-center gap-2 hover:bg-gray-200 transition text-base ${className || ''}`}
    >
      {isSvg ? (
        <img src={iconSrc} alt={alt} width={22} height={22} />
      ) : (
        <Image src={iconSrc} alt={alt} width={22} height={22} />
      )}
      {children}
    </Button>
  );
});

export default SocialLoginButton; 