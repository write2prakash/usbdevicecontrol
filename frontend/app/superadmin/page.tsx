"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, authMe, logout } from "../../lib/api";

type Company = {
  id: number;
  name: string;
  domain: string;
  max_seats: number;
  is_active: boolean;
};

type CreatedCompanyResult = {
  id: number;
  name: string;
  domain: string;
  max_seats: number;
  is_active: boolean;
  admin_name: string;
  admin_email: string;
  admin_temp_password: string;
};

export default function SuperAdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [maxSeats, setMaxSeats] = useState(10);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [createdCompany, setCreatedCompany] = useState<CreatedCompanyResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/(auth)/login");
  };

  useEffect(() => {
    const load = async () => {
      try {
        const profile = await authMe();
        if (profile.role !== "super_admin") {
          router.push("/(auth)/login");
          return;
        }
        setCurrentUserRole(profile.role);
        const response = await apiGet("/superadmin/companies");
        setCompanies(response.data);
      } catch (err) {
        logout();
        router.push("/(auth)/login");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const handleCreateCompany = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await apiPost("/superadmin/companies", {
        name,
        domain,
        max_seats: maxSeats,
        admin_name: adminName,
        admin_email: adminEmail,
      });
      setCreatedCompany(response.data);
      setCompanies((prev) => [...prev, response.data]);
      setName("");
      setDomain("");
      setMaxSeats(10);
      setAdminName("");
      setAdminEmail("");
    } catch (err) {
      setError("Unable to create company. Confirm your input and login status.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen p-8 bg-slate-50">
      <div className="mx-auto max-w-6xl rounded-3xl bg-white p-8 shadow-lg">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
        {loading ? (
          <p>Loading companies...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border p-6">Companies: {companies.length}</div>
              <div className="rounded-2xl border p-6">Seat Usage</div>
              <div className="rounded-2xl border p-6">USB Events</div>
            </div>
            <div className="rounded-2xl border p-6">
              <h2 className="text-xl font-semibold mb-4">Create company</h2>
              {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
              <form className="space-y-4" onSubmit={handleCreateCompany}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm text-slate-700">Company name</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 block w-full rounded-lg border px-3 py-2"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm text-slate-700">Domain</span>
                    <input
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className="mt-1 block w-full rounded-lg border px-3 py-2"
                      required
                    />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm text-slate-700">Max seats</span>
                    <input
                      type="number"
                      value={maxSeats}
                      min={1}
                      onChange={(e) => setMaxSeats(Number(e.target.value))}
                      className="mt-1 block w-full rounded-lg border px-3 py-2"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm text-slate-700">Admin name</span>
                    <input
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="mt-1 block w-full rounded-lg border px-3 py-2"
                      required
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-sm text-slate-700">Admin email</span>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="mt-1 block w-full rounded-lg border px-3 py-2"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
                >
                  {submitting ? "Creating company..." : "Create company"}
                </button>
              </form>
              {createdCompany && (
                <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-800">
                  <p className="font-semibold">Company created.</p>
                  <p>Admin: {createdCompany.admin_name} &lt;{createdCompany.admin_email}&gt;</p>
                  <p>Password: {createdCompany.admin_temp_password}</p>
                </div>
              )}
            </div>
            <div className="rounded-2xl border p-6">
              <h2 className="text-xl font-semibold mb-4">Companies</h2>
              <div className="space-y-4">
                {companies.map((company) => (
                  <div key={company.id} className="rounded-2xl border p-4">
                    <div className="text-lg font-semibold">{company.name}</div>
                    <div className="text-sm text-slate-600">{company.domain}</div>
                    <div className="mt-2 text-sm text-slate-700">Quota: {company.max_seats}</div>
                    <div className="text-sm text-slate-500">Active: {company.is_active ? "Yes" : "No"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
