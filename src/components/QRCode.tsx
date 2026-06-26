'use client';

import QRCode from 'react-qr-code';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
}

export function QRCodeDisplay({ value, size = 200, bgColor = '#ffffff', fgColor = '#000000' }: QRCodeDisplayProps) {
  return <QRCode value={value} size={size} bgColor={bgColor} fgColor={fgColor} />;
}