import {
  Baby, Banknote, BookOpen, Briefcase, Bus, Car, Coffee, Dumbbell, Film, Fuel, Gamepad2, Gift, GraduationCap, Heart,
  House, Landmark, Lightbulb, Music, PawPrint, Pill, PiggyBank, Plane, Repeat, Scissors, Shirt, ShoppingBag, ShoppingCart,
  Smartphone, Sparkles, Tag, Utensils, Wallet, Wifi, Wrench, Zap, type LucideIcon,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, coffee: Coffee, cart: ShoppingCart, bag: ShoppingBag, shirt: Shirt, gift: Gift,
  car: Car, bus: Bus, fuel: Fuel, plane: Plane, home: House, bulb: Lightbulb, wifi: Wifi, wrench: Wrench,
  heart: Heart, pill: Pill, dumbbell: Dumbbell, scissors: Scissors, music: Music, film: Film, game: Gamepad2,
  book: BookOpen, grad: GraduationCap, baby: Baby, paw: PawPrint, phone: Smartphone, repeat: Repeat, zap: Zap,
  wallet: Wallet, bank: Landmark, cash: Banknote, piggy: PiggyBank, briefcase: Briefcase, sparkles: Sparkles, tag: Tag,
};

export function CategoryIcon({ name, size = 20 }: { name?: string | null; size?: number }) {
  const I = CATEGORY_ICONS[name ?? ''] ?? Tag;
  return <I size={size} strokeWidth={1.9} />;
}

export const COLORS = ['#e5844a', '#4a8fe5', '#8b6fd6', '#e0566b', '#d6a13a', '#3aa88f', '#c25fa5', '#6b7a8f', '#2f9e5b', '#111111'];
