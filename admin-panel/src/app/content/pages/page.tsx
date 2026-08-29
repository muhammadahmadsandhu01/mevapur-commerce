import { redirect } from 'next/navigation';

export default function PagesPage() {
  redirect('/content?type=page');
}
