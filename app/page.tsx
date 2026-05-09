"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Character {
  id: string;
  name: string;
  description: string;
}

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/characters")
      .then((res) => {
        if (res.ok) {
          router.replace("/chat");
        } else {
          router.replace("/login");
        }
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="page-center">
        <p>Loading...</p>
      </div>
    );
  }

  return null;
}
