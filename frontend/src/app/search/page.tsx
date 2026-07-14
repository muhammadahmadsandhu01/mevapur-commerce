'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/?search=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div style={{ padding: '50px', textAlign: 'center', minHeight: '100vh' }}>
      <h1>Search Products</h1>
      <form onSubmit={handleSearch} style={{ marginTop: '20px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          style={{ padding: '10px', width: '300px', marginRight: '10px' }}
        />
        <button type="submit" style={{ padding: '10px 20px' }}>
          Search
        </button>
      </form>
      <a href="/" style={{ display: 'inline-block', marginTop: '20px', color: '#0F766E' }}>
        ← Back to Home
      </a>
    </div>
  );
}