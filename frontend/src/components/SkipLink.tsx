'use client';

export default function SkipLink() {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const main = document.getElementById('main-content');
    if (main) {
      main.focus();
      main.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <a
      href="#main-content"
      onClick={handleClick}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[99999] focus:rounded-lg focus:bg-[#ff8a00] focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-[#0b132b] focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#0b132b]"
    >
      Skip to main content
    </a>
  );
}
