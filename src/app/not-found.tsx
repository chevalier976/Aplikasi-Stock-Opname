import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-text-primary mb-4">
          Halaman Tidak Ditemukan
        </h2>
        <p className="text-text-secondary mb-6">
          Maaf, halaman yang Anda cari tidak ada.
        </p>
        <Link
          href="/"
          className="inline-block bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary-light transition"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
