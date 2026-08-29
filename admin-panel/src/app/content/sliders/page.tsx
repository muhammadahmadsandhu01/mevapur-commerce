import { redirect } from 'next/navigation';

export default function SlidersPage() {
  redirect('/content?type=slider');
}
