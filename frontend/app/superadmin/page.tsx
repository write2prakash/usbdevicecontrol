"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPut, apiDelete, authMe, logout } from "../../lib/api";

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

type Credentials = {
  admin_name: string;
  admin_email: string;
  temp_password?: string;
};

export default function SuperAdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [maxSeats, setMaxSeats] = useState(10);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [createdCompany, setCreatedCompany] = useState<CreatedCompanyResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit modal
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editName, setEditName] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editMaxSeats, setEditMaxSeats] = useState(10);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete modal
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Credentials modal
  const [credentialsCompany, setCredentialsCompany] = useState<Company | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  useEffect(() => {
    const load = async () => {
      try {
        const profile = await authMe();
        if (profile.role !== "super_admin") {
          router.push("/login");
          return;
        }
        const response = await apiGet("/superadmin/companies");
        setCompanies(response.data);
      } catch {
        logout();
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const handleCreateCompany = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
    } catch {
      setError("Unable to create company. Confirm your input and login status.");
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (company: Company) => {
    setEditingCompany(company);
    setEditName(company.name);
    setEditDomain(company.domain);
    setEditMaxSeats(company.max_seats);
    setEditIsActive(company.is_active);
    setEditError("");
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCompany) return;
    setEditSubmitting(true);
    setEditError("");
    try {
      const response = await apiPut(`/superadmin/companies/${editingCompany.id}`, {
        name: editName,
        domain: editDomain,
        max_seats: editMaxSeats,
        is_active: editIsActive,
      });
      setCompanies((prev) =>
        prev.map((c) => (c.id === editingCompany.id ? response.data : c))
      );
      setEditingCompany(null);
    } catch (err: any) {
      setEditError(err?.response?.data?.detail ?? "Failed to update company.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCompany) return;
    setDeleteSubmitting(true);
    try {
      await apiDelete(`/superadmin/companies/${deletingCompany.id}`);
      setCompanies((prev) => prev.filter((c) => c.id !== deletingCompany.id));
      setDeletingCompany(null);
    } catch {
      // keep modal open so user sees it failed
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const openCredentials = async (company: Company) => {
    setCredentialsCompany(company);
    setCredentials(null);
    setCredentialsLoading(true);
    try {
      const response = await apiGet(`/superadmin/companies/${company.id}/credentials`);
      setCredentials(response.data);
    } catch {
      setCredentials(null);
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!credentialsCompany) return;
    setResetSubmitting(true);
    try {
      const response = await apiPost(`/superadmin/companies/${credentialsCompany.id}/reset-password`);
      setCredentials(response.data);
    } catch {
      // silent
    } finally {
      setResetSubmitting(false);
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
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border p-6">Companies: {companies.length}</div>
              <div className="rounded-2xl border p-6">Seat Usage</div>
              <div className="rounded-2xl border p-6">USB Events</div>
            </div>

            {/* Create company form */}
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

            {/* Companies list */}
            <div className="rounded-2xl border p-6">
              <h2 className="text-xl font-semibold mb-4">Companies</h2>
              <div className="space-y-4">
                {companies.map((company) => (
                  <div key={company.id} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold">{company.name}</div>
                        <div className="text-sm text-slate-600">{company.domain}</div>
                        <div className="mt-1 text-sm text-slate-700">Quota: {company.max_seats} seats</div>
                        <div className="text-sm">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              company.is_active
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-600"
                            }`}
                          >
                            {company.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => openCredentials(company)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Credentials
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(company)}
                          className="rounded-lg border border-blue-300 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCompany(company)}
                          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {companies.length === 0 && (
                  <p className="text-sm text-slate-500">No companies yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-4">Edit company</h2>
            {editError && <p className="text-sm text-red-600 mb-3">{editError}</p>}
            <form className="space-y-4" onSubmit={handleEditSubmit}>
              <label className="block">
                <span className="text-sm text-slate-700">Company name</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border px-3 py-2"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">Domain</span>
                <input
                  value={editDomain}
                  onChange={(e) => setEditDomain(e.target.value)}
                  className="mt-1 block w-full rounded-lg border px-3 py-2"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">Max seats</span>
                <input
                  type="number"
                  value={editMaxSeats}
                  min={1}
                  onChange={(e) => setEditMaxSeats(Number(e.target.value))}
                  className="mt-1 block w-full rounded-lg border px-3 py-2"
                  required
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm text-slate-700">Active</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
                >
                  {editSubmitting ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-2">Delete company</h2>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to delete <strong>{deletingCompany.name}</strong>? This will permanently remove all associated users, endpoints, and USB event data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteSubmitting}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleteSubmitting ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setDeletingCompany(null)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {credentialsCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-1">Admin credentials</h2>
            <p className="text-sm text-slate-500 mb-4">{credentialsCompany.name}</p>
            {credentialsLoading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : credentials ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="text-slate-500 text-xs mb-0.5">Admin name</p>
                  <p className="font-medium text-slate-800">{credentials.admin_name}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="text-slate-500 text-xs mb-0.5">Admin email</p>
                  <p className="font-medium text-slate-800">{credentials.admin_email}</p>
                </div>
                {credentials.temp_password && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
                    <p className="text-amber-600 text-xs mb-0.5">New temporary password</p>
                    <p className="font-mono font-semibold text-amber-800">{credentials.temp_password}</p>
                    <p className="text-xs text-amber-600 mt-1">Share this with the admin. It won't be shown again.</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetSubmitting}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {resetSubmitting ? "Resetting..." : "Reset admin password"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-red-500">Could not load credentials.</p>
            )}
            <button
              type="button"
              onClick={() => { setCredentialsCompany(null); setCredentials(null); }}
              className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
