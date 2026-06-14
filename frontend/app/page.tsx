import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-semibold mb-4">USB Device Control & Monitoring</h1>
        <p className="mb-6 text-lg text-slate-700">
          Multi-tenant SaaS platform for Windows device agents, real-time USB approvals, and tenant management.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Link className="rounded-xl border border-slate-300 bg-white p-6 shadow-sm hover:shadow-md" href="/(auth)/login">
            <h2 className="text-2xl font-semibold">Login</h2>
            <p className="mt-2 text-slate-600">Sign in to access platform dashboards.</p>
          </Link>
          <Link className="rounded-xl border border-slate-300 bg-white p-6 shadow-sm hover:shadow-md" href="/superadmin">
            <h2 className="text-2xl font-semibold">Super Admin</h2>
            <p className="mt-2 text-slate-600">View companies, quotas, and audit logs.</p>
          </Link>
          <Link className="rounded-xl border border-slate-300 bg-white p-6 shadow-sm hover:shadow-md" href="/admin">
            <h2 className="text-2xl font-semibold">Company Admin</h2>
            <p className="mt-2 text-slate-600">Manage endpoints, approvals, and notifications.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
