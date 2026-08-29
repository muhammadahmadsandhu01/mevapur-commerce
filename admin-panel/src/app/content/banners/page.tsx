import { redirect } from 'next/navigation';

export default function BannersPage() {
  redirect('/content?type=banner');
}
