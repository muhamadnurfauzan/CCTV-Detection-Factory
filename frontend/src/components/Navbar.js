import React from "react";
import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  const navItem = (to, label) => (
    <Link
      to={to}
      className={`px-3 py-2 rounded-md text-sm font-medium ${
        pathname === to ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-200"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="bg-white shadow-sm p-3 flex gap-3 sticky top-0 z-50">
      {navItem("/", "Dashboard")}
      {navItem("/cctv", "Daftar CCTV")}
    </nav>
  );
}
