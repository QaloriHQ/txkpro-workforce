"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { PlatformAccount } from "@/lib/admin/platform-users";

export function PlatformUserDirectory({ accounts }: { accounts: PlatformAccount[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const filtered = useMemo(() => accounts.filter(account => {
    const all = [account.name, account.email ?? "", ...account.memberships.map(m => [m.role,m.scopeType,m.scopeId].filter(Boolean).join(" "))].join(" ").toLowerCase();
    return all.includes(query.trim().toLowerCase()) &&
      (role === "all" || account.memberships.some(m => m.family === role || m.role === role));
  }), [accounts, query, role]);

  return <>
    <div className="txk-admin-user-tools">
      <label htmlFor="txk-admin-user-search" className="txk-admin-small">Search this page</label>
      <input id="txk-admin-user-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, email or role"/>
      <label htmlFor="txk-admin-user-role" className="txk-admin-small">Membership type</label>
      <select id="txk-admin-user-role" value={role} onChange={event => setRole(event.target.value)}>
        <option value="all">All accounts</option>
        <option value="workforce">Workforce</option>
        <option value="advertiser">Advertiser</option>
      </select>
      <span className="txk-admin-small">{filtered.length} of {accounts.length} displayed</span>
    </div>
    <div className="txk-admin-user-table">
      <table><thead><tr><th>User</th><th>Account</th><th>Memberships</th><th>Verified</th><th>Last sign in</th><th>Action</th></tr></thead>
        <tbody>
          {filtered.map(account => <tr key={account.authUserId}>
            <td><strong>{account.name}</strong><br/><span className="txk-admin-small">{account.email ?? "No email"}</span></td>
            <td>{account.status}</td>
            <td>{account.memberships.length ? account.memberships.map(m => <div key={m.key} className="txk-admin-small">{m.role} · {m.scopeType}{m.scopeId ? " / " + m.scopeId : ""} ({m.status})</div>) : "None"}</td>
            <td>{account.emailVerified ? "Verified" : "Pending"}</td>
            <td>{account.lastSignInAt ? new Date(account.lastSignInAt).toLocaleDateString() : "Never"}</td>
            <td><Link href={`/admin/users/${encodeURIComponent(account.authUserId)}`}>View details</Link></td>
          </tr>)}
          {!filtered.length && <tr><td colSpan={6}>No matching accounts on this page.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}
