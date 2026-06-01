import { Image } from 'react-native';
import logo from '../assets/logo.png';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <Image
      source={logo}
      style={{
        width: size,
        height: size,
      }}
      resizeMode="contain"
    />
  );
}